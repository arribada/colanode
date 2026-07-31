interface FilePreviewVideoProps {
  url: string;
}

export const FilePreviewVideo = ({ url }: FilePreviewVideoProps) => {
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- user-uploaded media, no caption track available
    <video controls src={url} className="w-full object-contain" />
  );
};
