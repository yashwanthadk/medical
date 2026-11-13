import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { FindingSeverity } from '../types/medical';

interface StatusBadgeProps {
  status: FindingSeverity;
  compact?: boolean;
}

const STATUS_CONFIG: Record<
  FindingSeverity,
  {
    label: string;
    shortLabel: string;
    containerClass: string;
    Icon: typeof CheckCircle2;
  }
> = {
  normal: {
    label: 'Within Reference Range',
    shortLabel: 'Within Range',
    containerClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Icon: CheckCircle2,
  },
  attention: {
    label: 'Needs Attention / Review',
    shortLabel: 'Needs Review',
    containerClass: 'bg-amber-50 text-amber-800 border-amber-200',
    Icon: AlertTriangle,
  },
  abnormal: {
    label: 'Abnormal Finding — Medical Review',
    shortLabel: 'Abnormal Finding',
    containerClass: 'bg-red-50 text-red-800 border-red-200',
    Icon: AlertCircle,
  },
};

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.attention;
  const { Icon } = cfg;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 ${cfg.containerClass}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{compact ? cfg.shortLabel : cfg.label}</span>
    </span>
  );
}
