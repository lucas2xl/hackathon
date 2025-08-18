import { Header } from "@/components/header";
import {
  PodcastsSkeleton,
  TrendsSkeleton,
} from "@/components/loading-skeletons";
import { PodcastsSection } from "@/components/podcasts-section";
import { TrendsSection } from "@/components/trends-section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchPodcasts, fetchTrends } from "@/lib/api";
import { Suspense } from "react";

export default async function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      {/* Container principal com sticky positioning */}
      <main className="pt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              TD Trends Dashboard
            </h1>
            <p className="text-gray-600">
              Cenários estratégicos e análises de tendências para consultoria
              empresarial
            </p>
          </div>

          <Tabs defaultValue="scenarios" className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-md mb-6">
              <TabsTrigger value="scenarios">Cenários por Data</TabsTrigger>
              <TabsTrigger value="podcasts">Podcasts</TabsTrigger>
            </TabsList>

            <TabsContent value="scenarios">
              <Suspense fallback={<TrendsSkeleton />}>
                <TrendsContent />
              </Suspense>
            </TabsContent>

            <TabsContent value="podcasts">
              <Suspense fallback={<PodcastsSkeleton />}>
                <PodcastsContent />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

async function TrendsContent() {
  try {
    const trendsData = await fetchTrends({ limit: 100 });
    return <TrendsSection initialData={trendsData} />;
  } catch (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">
          Erro ao carregar cenários:{" "}
          {error instanceof Error ? error.message : "Erro desconhecido"}
        </p>
      </div>
    );
  }
}

async function PodcastsContent() {
  try {
    const podcastsData = await fetchPodcasts({ limit: 10 });
    return <PodcastsSection initialData={podcastsData} />;
  } catch (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">
          Erro ao carregar podcasts:{" "}
          {error instanceof Error ? error.message : "Erro desconhecido"}
        </p>
      </div>
    );
  }
}
