import { clsx, type ClassValue } from "clsx";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(dateObj, {
    addSuffix: true,
    locale: ptBR,
  });
}

export function formatDate(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return format(dateObj, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
}

export function formatDateTime(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return format(dateObj, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function getRelevanceBadgeVariant(
  relevance?: number
): "default" | "secondary" | "destructive" | "outline" {
  if (!relevance) return "outline";
  if (relevance >= 8) return "default";
  if (relevance >= 6) return "secondary";
  return "outline";
}

export function getDomainFromUrl(url?: string): string {
  if (!url) return "Link não disponível";
  try {
    const domain = new URL(url).hostname;
    return domain.replace("www.", "");
  } catch {
    return "Link inválido";
  }
}

export function groupTrendsByDate(trends: any[]) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: Record<string, any[]> = {};

  trends.forEach((trend) => {
    if (!trend) return;

    const trendDate = new Date(trend.createdAt);
    const isToday = trendDate.toDateString() === today.toDateString();
    const isYesterday = trendDate.toDateString() === yesterday.toDateString();

    let dateKey: string;
    if (isToday) {
      dateKey = "Hoje";
    } else if (isYesterday) {
      dateKey = "Ontem";
    } else {
      dateKey = trendDate.toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "short",
      });
    }

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(trend);
  });

  return groups;
}
