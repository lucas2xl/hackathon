"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Podcast, PodcastsResponse } from "@/lib/types";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import {
  Calendar,
  CheckCircle,
  Copy,
  FileText,
  Mic,
  Volume2,
  Play,
  Pause,
} from "lucide-react";
import { useState } from "react";

interface PodcastsSectionProps {
  initialData: PodcastsResponse;
}

export function PodcastsSection({ initialData }: PodcastsSectionProps) {
  const [selectedPodcast, setSelectedPodcast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const handleCopyContent = async (content: string, podcastId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(podcastId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("Erro ao copiar:", error);
    }
  };

  if (!initialData.podcasts || initialData.podcasts.length === 0) {
    return (
      <div className="text-center py-12">
        <Mic className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500 text-lg">Nenhum podcast disponível</p>
        <p className="text-gray-400 text-sm">
          Gere um novo podcast para ver o conteúdo
        </p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] overflow-y-auto space-y-6 custom-scrollbar pr-2">
      {initialData.podcasts.map((podcast: Podcast) => (
        <Card
          key={podcast.id}
          className="hover:border-blue-300 transition-colors"
        >
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg mb-2 flex items-center">
                  <Mic className="h-5 w-5 mr-2 text-blue-600" />
                  Podcast da Semana
                </CardTitle>
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                  <span className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    {formatDate(podcast.weekStart)} a{" "}
                    {formatDate(podcast.weekEnd)}
                  </span>
                  <Badge variant="outline">
                    Episódio #{podcast.id.slice(-4)}
                  </Badge>
                  <span className="text-xs">
                    há {formatRelativeTime(podcast.createdAt)}
                  </span>
                </div>
              </div>
              {/* Botão Play Sempre Visível */}
              <div className="ml-4 flex items-start">
                <Button
                  variant={podcast.audioUrl ? "default" : "outline"}
                  size="sm"
                  disabled={!podcast.audioUrl}
                  className="flex items-center space-x-1"
                  onClick={() => {
                    if (!podcast.audioUrl) return;
                    const el = document.getElementById(
                      `audio-${podcast.id}`
                    ) as HTMLAudioElement | null;
                    if (!el) return;
                    if (playingId === podcast.id && !el.paused) {
                      el.pause();
                    } else {
                      // Pausar outro em reprodução
                      if (playingId && playingId !== podcast.id) {
                        const prev = document.getElementById(
                          `audio-${playingId}`
                        ) as HTMLAudioElement | null;
                        if (prev && !prev.paused) prev.pause();
                      }
                      el.play();
                    }
                  }}
                >
                  {playingId === podcast.id ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <span className="text-xs">
                    {podcast.audioUrl
                      ? playingId === podcast.id
                        ? "Pausar"
                        : "Tocar"
                      : "Processando"}
                  </span>
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Player de Áudio */}
            {podcast.audioUrl ? (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border-2 border-blue-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-600 p-2 rounded-full">
                      <Volume2 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        Podcast em Áudio
                      </h3>
                      <p className="text-sm text-gray-600">
                        Duração estimada: 10-15 minutos
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-green-100 text-green-800 border-green-300">
                    Disponível
                  </Badge>
                </div>

                {/* Audio Player */}
                <div className="space-y-3">
                  <audio
                    id={`audio-${podcast.id}`}
                    controls
                    className="w-full"
                    preload="metadata"
                    onPlay={() => setPlayingId(podcast.id)}
                    onPause={() => {
                      const el = document.getElementById(
                        `audio-${podcast.id}`
                      ) as HTMLAudioElement | null;
                      if (!el || el.paused) setPlayingId((p) => (p === podcast.id ? null : p));
                    }}
                  >
                    <source
                      src={`http://localhost:3001${podcast.audioUrl}`}
                      type="audio/mpeg"
                    />
                    Seu navegador não suporta o elemento de áudio.
                  </audio>

                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>🎧 Clique em play para ouvir</span>
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="text-xs"
                    >
                      <a
                        href={`http://localhost:3001${podcast.audioUrl}`}
                        download
                      >
                        ⬇️ Download
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 p-4 rounded-lg border-2 border-amber-200">
                <div className="flex items-center space-x-2 text-amber-800">
                  <Volume2 className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Áudio em processamento...
                  </span>
                </div>
                <p className="text-xs text-amber-700 mt-1">
                  O arquivo de áudio estará disponível em breve.
                </p>
              </div>
            )}

            {/* Botões de Ação */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center space-x-2">
                <Button
                  onClick={() => handleCopyContent(podcast.content, podcast.id)}
                  variant="ghost"
                  size="sm"
                  className="flex items-center space-x-1"
                >
                  {copiedId === podcast.id ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span className="text-xs">Copiar Roteiro</span>
                </Button>
              </div>

              <Button
                onClick={() =>
                  setSelectedPodcast(
                    selectedPodcast === podcast.id ? null : podcast.id
                  )
                }
                variant="outline"
                size="sm"
                className="flex items-center space-x-1"
              >
                <FileText className="h-4 w-4" />
                <span className="text-xs">
                  {selectedPodcast === podcast.id
                    ? "Ocultar Roteiro"
                    : "Ver Roteiro"}
                </span>
              </Button>
            </div>
          </CardContent>

          {selectedPodcast === podcast.id && (
            <CardContent className="border-t bg-gray-50">
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed bg-white p-4 rounded-lg border overflow-auto max-h-96">
                  {podcast.content}
                </pre>
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
