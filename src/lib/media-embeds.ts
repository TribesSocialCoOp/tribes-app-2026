/**
 * Utility functions for transforming media URLs into embeddable iframe URLs.
 */

export function getEmbedUrl(url: string): string | null {
  if (!url) return null;

  try {
    const parsedUrl = new URL(url);

    // Spotify
    const spotifyMatch = url.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
    if (spotifyMatch) {
      return `https://open.spotify.com/embed/${spotifyMatch[1]}/${spotifyMatch[2]}?theme=0`;
    }

    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) {
      return `https://www.youtube.com/embed/${ytMatch[1]}?rel=0`;
    }

    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/([0-9]+)/);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }

    // Apple Music
    if (parsedUrl.hostname === 'music.apple.com') {
      parsedUrl.hostname = 'embed.music.apple.com';
      return parsedUrl.toString();
    }

    // Tidal
    const tidalMatch = url.match(/tidal\.com\/(?:browse\/)?(track|album|playlist)\/([0-9]+)/);
    if (tidalMatch) {
      // Tidal embeds use plural forms for the path
      const type = tidalMatch[1] + 's'; 
      return `https://embed.tidal.com/${type}/${tidalMatch[2]}`;
    }

    // SoundCloud
    if (url.includes('soundcloud.com') && !url.includes('w.soundcloud.com')) {
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&visual=true`;
    }

    // Bandcamp (Check if it's already an embed URL, if so, return it)
    if (url.includes('bandcamp.com/EmbeddedPlayer')) {
      return url;
    }
    
    // If it's a direct bandcamp track/album URL, we unfortunately can't auto-convert 
    // it to an embed without querying their oEmbed API, so we'll just return the URL 
    // and hope the user provided an embed URL, or they can use the HTML block.
    if (url.includes('bandcamp.com')) {
      // Attempting to just iframe it might fail due to x-frame-options, but we can try
      return url;
    }

    // Direct Video files (mp4, webm)
    if (url.match(/\.(mp4|webm|ogg)$/i)) {
      return url;
    }

    // Already an embed URL (e.g., SoundCloud iframe src or other iframes)
    return url;
  } catch (e) {
    return null;
  }
}
