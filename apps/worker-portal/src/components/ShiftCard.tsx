'use client';

import { fmtRange, type Shift } from '@flexshift/api-client';
import clsx from 'clsx';
import { Building2, Heart, MapPin, Star } from 'lucide-react';
import Link from 'next/link';
import { Payout, ShiftBadges } from '@/components/common';

export function ShiftCard({
  shift, onToggleWatch, onToggleFavourite,
}: { shift: Shift; onToggleWatch?: () => void; onToggleFavourite?: () => void }) {
  const org = shift.branch?.organization?.name;
  return (
    <article className={clsx('bg-white rounded-xl border shadow-sm', shift.isEmergency ? 'border-rose-300' : 'border-slate-200')}>
      <Link href={`/shifts/${shift.id}`} className="block p-4 pb-3">
        <div className="flex justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 truncate">{shift.branch?.name ?? shift.title}</h3>
            {org && <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Building2 className="w-3 h-3" />{org}</p>}
            {shift.branch?.city && <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{shift.branch.city}</p>}
          </div>
          <Payout shift={shift} />
        </div>
        <p className="text-sm text-slate-800 font-medium mt-2">{fmtRange(shift.startTime, shift.endTime)}</p>
        <p className="text-sm text-slate-700 mt-0.5">{shift.title}</p>
        <p className="text-xs text-slate-500 mb-2">{shift.roleRequired}</p>
        <ShiftBadges shift={shift} />
      </Link>
      {(onToggleWatch || onToggleFavourite) && (
        <div className="flex border-t border-slate-100 text-sm font-semibold">
          {onToggleWatch && (
            <button onClick={onToggleWatch} aria-pressed={!!shift.isWatched} className={clsx('flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5', shift.isWatched ? 'text-rose-600' : 'text-slate-600')}>
              <Heart className={clsx('w-4 h-4', shift.isWatched && 'fill-current')} /> {shift.isWatched ? 'Watching' : 'Watch'}
            </button>
          )}
          {onToggleFavourite && (
            <button onClick={onToggleFavourite} aria-pressed={!!shift.isFavouriteBranch} className={clsx('flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 border-l border-slate-100', shift.isFavouriteBranch ? 'text-amber-600' : 'text-slate-600')}>
              <Star className={clsx('w-4 h-4', shift.isFavouriteBranch && 'fill-current')} /> {shift.isFavouriteBranch ? 'Favourited' : 'Favourite branch'}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
