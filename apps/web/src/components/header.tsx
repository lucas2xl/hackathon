"use client";

import { generatePodcast, scrapeTrends } from "@/lib/api";
import { Activity } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function Header() {
  const [isScrapingLoading, setIsScrapingLoading] = useState(false);
  const [isPodcastLoading, setIsPodcastLoading] = useState(false);
  const router = useRouter();

  const handleScrape = async () => {
    try {
      setIsScrapingLoading(true);
      await scrapeTrends();

      // Aguardar um pouco e depois refresh
      setTimeout(() => {
        router.refresh();
        setIsScrapingLoading(false);
      }, 3000);
    } catch (error) {
      console.error("Erro ao executar scraping:", error);
      setIsScrapingLoading(false);
    }
  };

  const handleGeneratePodcast = async () => {
    try {
      setIsPodcastLoading(true);
      await generatePodcast();

      // Aguardar um pouco e depois refresh
      setTimeout(() => {
        router.refresh();
        setIsPodcastLoading(false);
      }, 3000);
    } catch (error) {
      console.error("Erro ao gerar podcast:", error);
      setIsPodcastLoading(false);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center space-x-3">
            <Activity className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">TD Trends</h1>
              <p className="text-sm text-gray-600">
                Inteligência estratégica em tempo real
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* <Button
              onClick={handleScrape}
              disabled={isScrapingLoading}
              className="flex items-center space-x-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${isScrapingLoading ? "animate-spin" : ""}`}
              />
              <span>
                {isScrapingLoading ? "Processando..." : "Buscar Trends"}
              </span>
            </Button>

            <Button
              onClick={handleGeneratePodcast}
              disabled={isPodcastLoading}
              variant="outline"
              className="flex items-center space-x-2"
            >
              <Mic
                className={`h-4 w-4 ${isPodcastLoading ? "animate-pulse" : ""}`}
              />
              <span>{isPodcastLoading ? "Gerando..." : "Gerar Podcast"}</span>
            </Button> */}
          </div>
        </div>
      </div>
    </header>
  );
}
