// Поддерживаемые платформы
export type Platform = 'youtube' | 'instagram' | 'tiktok';

// Метаданные видео для публикации
export interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
}

// Статистика публикации на платформе
export interface PlatformStats {
  views: number;
  likes: number;
  commentsCount: number;
}
