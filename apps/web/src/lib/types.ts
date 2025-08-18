export interface NewsItem {
  id: string;
  title: string;
  description?: string;
  link?: string;
  publishedAt?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Trend {
  id: string;
  term: string;
  volume?: string;
  position?: number;
  relevance?: number;
  isRelevant: boolean;
  title?: string;
  description?: string;
  category?: string;
  sourceOrigin?: string;
  createdAt: string;
  updatedAt: string;
  news: NewsItem[];
}

export interface TrendsResponse {
  trends: Trend[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Podcast {
  id: string;
  weekStart: string;
  weekEnd: string;
  content: string;
  audioUrl?: string;
  createdAt: string;
}

export interface PodcastsResponse {
  podcasts: Podcast[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
