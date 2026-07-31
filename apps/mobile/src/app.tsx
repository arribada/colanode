import { Asset } from 'expo-asset';
import { modelName } from 'expo-device';
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import {
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
} from 'react-native-webview/lib/WebViewTypes';
import superjson from 'superjson';

import { eventBus } from '@colanode/client/lib';
import { AppMeta, AppService } from '@colanode/client/services';
import { AppInitOutput } from '@colanode/client/types';
import { generateId, IdType } from '@colanode/core';
import { copyAssets, indexHtmlAsset } from '@colanode/mobile/lib/assets';
import { Message } from '@colanode/mobile/lib/types';
import { MobileFileSystem } from '@colanode/mobile/services/file-system';
import { MobileKyselyService } from '@colanode/mobile/services/kysely-service';
import { MobilePathService } from '@colanode/mobile/services/path-service';
import { MobilePushService } from '@colanode/mobile/services/push-service';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 0, margin: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#0a0a0a',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f5f5f5',
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#a3a3a3',
    textAlign: 'center',
  },
  errorRetryButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorRetryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a0a0a',
  },
});

// React Native's `global`/`window` is not a DOM EventTarget, so it has no
// `addEventListener('error' | 'unhandledrejection', ...)` (that's a browser
// API, only present inside the WebView content — see the console bridge in
// apps/mobile/src/ui/main.tsx). The native-side equivalent for uncaught JS
// exceptions is `ErrorUtils`. We chain through the previously installed
// handler (RN's own redbox/exception reporter) so behavior is unchanged --
// we only add a loud, contextual log on top of it.
//
// Unhandled promise rejections on the native side are already surfaced
// (non-silently) by React Native's built-in rejection tracking (LogBox in
// dev, console.warn in prod); there is no equivalent global hook to layer a
// custom context log onto without reconfiguring that polyfill at app
// bootstrap, which is out of scope here.
const defaultErrorHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  console.error('[Mobile] Uncaught global error', error, { isFatal });
  defaultErrorHandler(error, isFatal);
});

interface MobileErrorStateProps {
  testID: string;
  title: string;
  message: string;
  retryTestID: string;
  onRetry: () => void;
}

const MobileErrorState = ({
  testID,
  title,
  message,
  retryTestID,
  onRetry,
}: MobileErrorStateProps) => {
  return (
    <View testID={testID} style={styles.errorContainer}>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      <Pressable
        testID={retryTestID}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        style={styles.errorRetryButton}
      >
        <Text style={styles.errorRetryText}>Try again</Text>
      </Pressable>
    </View>
  );
};

interface MobileErrorBoundaryState {
  error: Error | null;
}

// Wraps the native app tree (SafeAreaView + WebView) so a render-time error
// there shows a visible, test-observable failure state instead of a blank
// screen -- the React Native counterpart of the shared web AppErrorBoundary
// (@colanode/ui/components/app/app-error-boundary) that covers the web,
// desktop, and mobile-WebView content builds.
class MobileErrorBoundary extends Component<
  { children: ReactNode },
  MobileErrorBoundaryState
> {
  state: MobileErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): MobileErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      '[Mobile] Uncaught render error in app tree',
      error,
      errorInfo.componentStack
    );
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <MobileErrorState
        testID="app-error-boundary"
        title="Something went wrong"
        message={error.message || 'The app ran into an unexpected error.'}
        retryTestID="app-error-boundary-retry-button"
        onRetry={this.reset}
      />
    );
  }
}

export const App = () => {
  const windowId = useRef<string>(generateId(IdType.Window));
  const webViewRef = useRef<WebView>(null);
  const app = useRef<AppService | null>(null);
  const appInitialized = useRef<boolean>(false);
  const initOutput = useRef<AppInitOutput | null>(null);
  const pushService = useRef(new MobilePushService()).current;
  const pushToken = useRef<string | null>(null);

  const [uri, setUri] = useState<string | null>(null);
  const [baseDir, setBaseDir] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const indexAsset = Asset.fromModule(indexHtmlAsset);
      await indexAsset.downloadAsync();
      const localUri = indexAsset.localUri ?? indexAsset.uri;
      const dir = localUri.replace(/index\.html$/, '');
      setUri(localUri);
      setBaseDir(dir);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const paths = new MobilePathService();
        await copyAssets(paths);

        const appMeta: AppMeta = {
          type: 'mobile',
          platform: modelName ?? 'unknown',
        };

        app.current = new AppService(
          appMeta,
          new MobileFileSystem(),
          new MobileKyselyService(),
          paths
        );

        await app.current.migrate();
        await app.current.init();
        appInitialized.current = true;
        initOutput.current = 'success';
      } catch (error) {
        console.error(error);
        initOutput.current = 'error';
      }
    })();
  }, []);

  useEffect(() => {
    const id = eventBus.subscribe((event) => {
      sendMessage({ type: 'event', windowId: windowId.current, event });
    });

    return () => eventBus.unsubscribe(id);
  }, []);

  const handleMessage = useCallback(async (e: WebViewMessageEvent) => {
    const message = superjson.parse<Message>(e.nativeEvent.data);
    if (message.type === 'console') {
      if (message.level === 'log') {
        console.log(
          `[WebView ${message.level.toUpperCase()}] ${message.timestamp} ${message.message}`
        );
      } else if (message.level === 'warn') {
        console.warn(
          `[WebView ${message.level.toUpperCase()}] ${message.timestamp} ${message.message}`
        );
      } else if (message.level === 'error') {
        console.error(
          `[WebView ${message.level.toUpperCase()}] ${message.timestamp} ${message.message}`
        );
      } else if (message.level === 'info') {
        console.info(
          `[WebView ${message.level.toUpperCase()}] ${message.timestamp} ${message.message}`
        );
      } else if (message.level === 'debug') {
        console.debug(
          `[WebView ${message.level.toUpperCase()}] ${message.timestamp} ${message.message}`
        );
      }
    } else if (message.type === 'init') {
      let count = 0;
      while (initOutput.current === null) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        count++;
        // Cold first-run migrate+init can take well over 5s on a fresh
        // simulator, so budget 30s. On timeout, report an error result
        // instead of throwing into this un-awaited handler — a throw here
        // left the WebView waiting on init() forever with no signal.
        if (count > 600) {
          console.error('[Mobile] App initialization timed out after 30s');
          sendMessage({ type: 'init_result', output: 'error' });
          return;
        }
      }
      sendMessage({ type: 'init_result', output: initOutput.current });
    } else if (message.type === 'mutation') {
      if (!app.current) {
        return;
      }

      const result = await app.current.mediator.executeMutation(message.input);
      sendMessage({
        type: 'mutation_result',
        mutationId: message.mutationId,
        result,
      });
    } else if (message.type === 'push_enable') {
      const token = await pushService.enable();
      let success = false;
      if (token && app.current) {
        pushToken.current = token;
        const result = await app.current.mediator.executeMutation({
          type: 'apnsSubscription.create',
          userId: message.userId,
          deviceToken: token,
        });
        success = result.success;
      }

      sendMessage({
        type: 'push_enable_result',
        requestId: message.requestId,
        success,
      });
    } else if (message.type === 'push_disable') {
      const token = pushToken.current;
      if (token && app.current) {
        await app.current.mediator.executeMutation({
          type: 'apnsSubscription.delete',
          userId: message.userId,
          deviceToken: token,
        });
        pushToken.current = null;
      }

      await pushService.disable();
      sendMessage({
        type: 'push_disable_result',
        requestId: message.requestId,
      });
    } else if (message.type === 'push_get_state') {
      const state = await pushService.getState();
      sendMessage({
        type: 'push_get_state_result',
        requestId: message.requestId,
        state,
      });
    } else if (message.type === 'query') {
      if (!app.current) {
        return;
      }

      const result = await app.current.mediator.executeQuery(message.input);
      sendMessage({ type: 'query_result', queryId: message.queryId, result });
    } else if (message.type === 'query_and_subscribe') {
      if (!app.current) {
        return;
      }

      const result = await app.current.mediator.executeQueryAndSubscribe(
        message.key,
        message.windowId,
        message.input
      );
      sendMessage({
        type: 'query_and_subscribe_result',
        queryId: message.queryId,
        key: message.key,
        windowId: message.windowId,
        result,
      });
    } else if (message.type === 'query_unsubscribe') {
      if (!app.current) {
        return;
      }

      app.current.mediator.unsubscribeQuery(message.key, message.windowId);
    } else if (message.type === 'event') {
      eventBus.publish(message.event);
    }
  }, []);

  const sendMessage = useCallback((message: Message) => {
    webViewRef.current?.postMessage(superjson.stringify(message));
  }, []);

  const [webviewError, setWebviewError] = useState<string | null>(null);

  const handleWebViewError = useCallback((event: WebViewErrorEvent) => {
    const { description, code } = event.nativeEvent;
    console.error('[Mobile] WebView failed to load', { description, code });
    setWebviewError(description || 'Failed to load app content');
  }, []);

  const handleWebViewHttpError = useCallback((event: WebViewHttpErrorEvent) => {
    const { description, statusCode, url } = event.nativeEvent;
    console.error('[Mobile] WebView HTTP error', {
      description,
      statusCode,
      url,
    });
    setWebviewError(
      description || `Failed to load app content (HTTP ${statusCode})`
    );
  }, []);

  const retryWebView = useCallback(() => {
    setWebviewError(null);
    webViewRef.current?.reload();
  }, []);

  if (!uri) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator testID="app-loading-indicator" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView
        edges={['top', 'bottom', 'left', 'right']}
        style={styles.container}
      >
        <MobileErrorBoundary>
          {webviewError ? (
            <MobileErrorState
              testID="webview-load-error"
              title="Failed to load"
              message={webviewError}
              retryTestID="webview-load-error-retry-button"
              onRetry={retryWebView}
            />
          ) : (
            <WebView
              testID="app-webview"
              ref={webViewRef}
              style={{
                flex: 1,
                padding: 0,
                margin: 0,
                backgroundColor: '#0a0a0a',
              }}
              originWhitelist={['*']}
              allowFileAccess
              allowFileAccessFromFileURLs
              allowingReadAccessToURL={
                Platform.OS === 'ios' ? (baseDir ?? uri) : undefined
              }
              source={{ uri }}
              javaScriptEnabled
              setSupportMultipleWindows={false}
              onMessage={handleMessage}
              onError={handleWebViewError}
              onHttpError={handleWebViewHttpError}
              webviewDebuggingEnabled={
                __DEV__ || process.env.EXPO_PUBLIC_E2E === 'true'
              }
              allowsBackForwardNavigationGestures={true}
            />
          )}
        </MobileErrorBoundary>
      </SafeAreaView>
    </SafeAreaProvider>
  );
};
