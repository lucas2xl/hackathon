"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trend, TrendsResponse } from "@/lib/types";
import {
  formatRelativeTime,
  getDomainFromUrl,
  getRelevanceBadgeVariant,
  groupTrendsByDate,
} from "@/lib/utils";
import { Calendar, ExternalLink, TrendingUp } from "lucide-react";
import { useState } from "react";

interface TrendsSectionProps {
  initialData: TrendsResponse;
}

export function TrendsSection({ initialData }: TrendsSectionProps) {
  const [selectedTrend, setSelectedTrend] = useState<Trend | null>(
    initialData.trends && initialData.trends.length > 0
      ? initialData.trends[0]
      : null
  );

  const groupedTrends = groupTrendsByDate(initialData.trends);

  if (!initialData.trends || initialData.trends.length === 0) {
    return (
      <div className="text-center py-12">
        <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500 text-lg">Nenhum cenário disponível</p>
        <p className="text-gray-400 text-sm">
          Execute o scraping para obter novos dados
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Lista de Trends à Esquerda */}
      <div className="w-1/3 flex flex-col border-r border-gray-200 pr-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 sticky top-24 bg-gray-50 py-2 z-10">
          Cenários Estratégicos
        </h3>

        <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-2">
          {Object.entries(groupedTrends).map(([dateGroup, trends]) => (
            <div key={dateGroup} className="space-y-2">
              <h4 className="text-sm font-medium text-gray-600 border-b border-gray-100 pb-1">
                {dateGroup}
              </h4>
              {trends?.map((trend) => {
                if (!trend) return null;

                return (
                  <Card
                    key={trend.id}
                    className={`cursor-pointer transition-colors ${
                      selectedTrend?.id === trend.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 bg-white hover:border-blue-300"
                    }`}
                    onClick={() => setSelectedTrend(trend)}
                  >
                    <CardContent className="p-3">
                      <h4 className="font-medium text-sm text-gray-900 line-clamp-2 mb-2">
                        {trend.title || trend.term}
                      </h4>

                      <div className="space-y-2">
                        {trend.category && (
                          <Badge
                            variant="secondary"
                            className="text-xs truncate max-w-full"
                          >
                            {trend.category.split(",")[0].trim()}
                          </Badge>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {trend.news && trend.news.length > 0 && (
                              <span className="text-xs text-green-600 font-medium">
                                {trend.news.length} notícias
                              </span>
                            )}
                          </div>
                          <div>
                            {trend.relevance && (
                              <Badge
                                variant={getRelevanceBadgeVariant(
                                  trend.relevance
                                )}
                                className="text-xs"
                              >
                                {Math.round(trend.relevance * 10)}/10
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Detalhes do Trend Selecionado à Direita */}
      <div className="w-2/3 flex flex-col pl-6 h-full">
        {selectedTrend ? (
          <div className="flex flex-col h-full min-h-0">
            {/* Header e Descrição - Sticky */}
            <div className="sticky top-24 bg-gray-50 z-10 pb-4">
              <div className="bg-white rounded-lg p-4 shadow-sm border">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {selectedTrend.title || selectedTrend.term}
                </h2>
                <div className="flex flex-col space-y-2">
                  <div className="flex items-center space-x-2">
                    {selectedTrend.relevance && (
                      <Badge variant="outline">
                        Relevância: {Math.round(selectedTrend.relevance * 10)}
                        /10
                      </Badge>
                    )}
                    <span className="flex items-center text-sm text-gray-500">
                      <Calendar className="h-4 w-4 mr-1" />
                      {formatRelativeTime(selectedTrend.createdAt)}
                    </span>
                  </div>
                  {selectedTrend.category && (
                    <div className="flex flex-wrap gap-1">
                      {selectedTrend.category.split(",").map((cat, index) => (
                        <Badge
                          key={index}
                          className="bg-blue-100 text-blue-700 text-xs"
                        >
                          {cat.trim()}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Conteúdo com scroll */}
            <div className="flex-1 space-y-6 overflow-y-auto custom-scrollbar pr-2 pt-4">
              {/* Descrição */}
              {selectedTrend.description && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Análise Estratégica
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-700 leading-relaxed">
                      {selectedTrend.description}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Notícias - Área com scroll */}
              <Card className="flex-1 flex flex-col min-h-0">
                <CardHeader className="flex-shrink-0">
                  <CardTitle className="flex items-center text-lg">
                    <ExternalLink className="h-5 w-5 mr-2" />
                    Notícias Relacionadas
                    {selectedTrend.news && selectedTrend.news.length > 0 && (
                      <Badge className="ml-2 bg-green-100 text-green-700">
                        {selectedTrend.news.length} notícias
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                  {selectedTrend.news && selectedTrend.news.length > 0 ? (
                    <div className="space-y-4">
                      {selectedTrend.news.map((news) => (
                        <Card key={news.id} className="border border-gray-200">
                          <CardContent className="p-4">
                            {news.link ? (
                              <a
                                href={news.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block hover:bg-gray-50 transition-colors"
                              >
                                <h4 className="font-medium text-gray-900 hover:text-blue-600 transition-colors mb-2">
                                  {news.title}
                                </h4>
                                {news.description && (
                                  <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                                    {news.description}
                                  </p>
                                )}
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                  <span>
                                    {news.source || getDomainFromUrl(news.link)}
                                  </span>
                                  <span>
                                    {formatRelativeTime(news.createdAt)}
                                  </span>
                                </div>
                              </a>
                            ) : (
                              <div>
                                <h4 className="font-medium text-gray-900 mb-2">
                                  {news.title}
                                </h4>
                                {news.description && (
                                  <p className="text-gray-600 text-sm mb-3">
                                    {news.description}
                                  </p>
                                )}
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                  <span>
                                    {news.source || "Fonte não disponível"}
                                  </span>
                                  <span>
                                    {formatRelativeTime(news.createdAt)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-gray-50 rounded-lg">
                      <ExternalLink className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500">
                        Nenhuma notícia relacionada encontrada
                      </p>
                      <p className="text-gray-400 text-sm">
                        Execute o scraping para buscar novas notícias
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">
                Selecione um cenário para ver os detalhes
              </p>
              <p className="text-gray-400 text-sm">
                Clique em um item da lista à esquerda
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
