interface FilePreviewAudioProps {
  url: string;
  name?: string;
}

export const FilePreviewAudio = ({ url, name }: FilePreviewAudioProps) => {
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- user-uploaded media, no caption track available
    <audio
      controls
      src={url}
      className="w-full max-w-3xl"
      aria-label={name ? `Audio file: ${name}` : 'Audio file'}
    >
      Your browser does not support the audio element.
    </audio>
  );
};
