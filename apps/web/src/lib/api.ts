import { PodcastsResponse, TrendsResponse } from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

// Server Actions para buscar dados
export async function fetchTrends(params?: {
  page?: number;
  limit?: number;
  date?: string;
}): Promise<TrendsResponse> {
  const searchParams = new URLSearchParams();

  if (params?.page) searchParams.set("page", params.page.toString());
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.date) searchParams.set("date", params.date);

  const url = `${API_BASE_URL}/trends?${searchParams.toString()}`;

  const response = await fetch(url, {
    next: { revalidate: 60 }, // Revalidar a cada 60 segundos
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch trends: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchPodcasts(params?: {
  page?: number;
  limit?: number;
}): Promise<PodcastsResponse> {
  const searchParams = new URLSearchParams();

  if (params?.page) searchParams.set("page", params.page.toString());
  if (params?.limit) searchParams.set("limit", params.limit.toString());

  const url = `${API_BASE_URL}/podcast?${searchParams.toString()}`;

  const response = await fetch(url, {
    next: { revalidate: 300 }, // Revalidar a cada 5 minutos
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch podcasts: ${response.statusText}`);
  }

  return response.json();
}

// Server Actions para executar ações
export async function scrapeTrends(): Promise<{
  message: string;
  timestamp: string;
}> {
  const response = await fetch(`${API_BASE_URL}/trends/scrape`, {
    method: "POST",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to scrape trends: ${response.statusText}`);
  }

  return response.json();
}

export async function generatePodcast(): Promise<{
  message: string;
  timestamp: string;
}> {
  const response = await fetch(`${API_BASE_URL}/podcast/generate`, {
    method: "POST",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to generate podcast: ${response.statusText}`);
  }

  return response.json();
}
