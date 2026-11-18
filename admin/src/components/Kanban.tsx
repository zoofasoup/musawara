// The shared kanban board: columns of cards you can drag between columns (mouse, touch, or keyboard).
// It owns only dragging, the optimistic move and the column layout; what a card looks like and what a move
// does come from the screen. Build every board from this, never with raw HTML5 drag events.
import { useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";

export type KanbanColumn = {
  id: string;
  label: string;
  /** Cards can be dropped here. Default true. A column that only fills in by itself sets false. */
  droppable?: boolean;
  /** Shown when the column has no cards. */
  empty?: string;
  /** Tailwind background class for the little colour bar before the title, e.g. "bg-chart-3". */
  color?: string;
  /** Adds a "+" in the header and an "Add new" row at the bottom of the column. */
  onAdd?: () => void;
};

type Props<T> = {
  columns: KanbanColumn[];
  items: T[];
  getId: (item: T) => number | string;
  getColumn: (item: T) => string;
  /** Whether this card may be dragged at all (a locked card stays put). Default true. */
  canDrag?: (item: T) => boolean;
  renderCard: (item: T) => ReactNode;
  /** Called after a drop on another column. Throw to refuse: the card returns to where it was. */
  onMove: (item: T, toColumn: string) => Promise<void>;
  className?: string;
};

function Card<T>({ id, draggable, children }: { id: string; draggable: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled: !draggable });
  return (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      className={`touch-manipulation select-none ${isDragging ? "opacity-40" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
    >
      {children}
    </div>
  );
}

function Column({ col, count, children }: { col: KanbanColumn; count: number; children: ReactNode }) {
  const droppable = col.droppable !== false;
  const { setNodeRef, isOver } = useDroppable({ id: col.id, disabled: !droppable });
  return (
    <section
      ref={setNodeRef}
      aria-label={col.label}
      className={`min-w-0 rounded-2xl p-2 transition-colors ${isOver ? "bg-[var(--accent)]/10 ring-2 ring-[var(--accent)]/30" : "bg-surface2/80"}`}
    >
      <h3 className="flex items-center gap-2 px-1 py-1.5 text-sm font-medium text-ink">
        <span aria-hidden="true" className={`h-4 w-1 rounded-full ${col.color ?? "bg-muted"}`} />
        <span className="min-w-0 truncate">{col.label}</span>
        <span className="rounded-full bg-white px-1.5 text-xs font-normal text-ink2">{count}</span>
        {col.onAdd && (
          <button type="button" onClick={col.onAdd} aria-label={`Add to ${col.label}`} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full text-ink2 hover:bg-white hover:text-ink">
            <Icon name="plus" className="h-4 w-4" />
          </button>
        )}
      </h3>
      <div className="space-y-2">{children}</div>
      {col.onAdd && (
        <button type="button" onClick={col.onAdd} className="mt-2 flex min-h-9 w-full items-center gap-1.5 rounded-xl px-2 text-sm text-ink2 hover:bg-white/70 hover:text-ink">
          <Icon name="plus" className="h-4 w-4" />Add new
        </button>
      )}
    </section>
  );
}

export function Kanban<T>({ columns, items, getId, getColumn, canDrag = () => true, renderCard, onMove, className = "" }: Props<T>) {
  // Where a card sits while its move is being saved, so a drop shows at once and is undone if refused.
  const [pending, setPending] = useState<Record<string, string>>({});
  const [active, setActive] = useState<T | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );
  const key = (i: T) => String(getId(i));
  const colOf = (i: T) => pending[key(i)] ?? getColumn(i);

  const onDragStart = (e: DragStartEvent) => setActive(items.find((i) => key(i) === e.active.id) ?? null);
  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null);
    const item = items.find((i) => key(i) === e.active.id);
    const to = e.over?.id == null ? null : String(e.over.id);
    if (!item || !to || to === colOf(item)) return;
    const k = key(item);
    setPending((p) => ({ ...p, [k]: to }));
    try {
      await onMove(item, to);
    } catch {
      /* the screen's onMove reports why; the card just goes back */
    } finally {
      setPending((p) => {
        const { [k]: _gone, ...rest } = p;
        return rest;
      });
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 ${className}`}>
        {columns.map((col) => {
          const here = items.filter((i) => colOf(i) === col.id);
          return (
            <Column key={col.id} col={col} count={here.length}>
              {here.map((i) => (
                <Card key={key(i)} id={key(i)} draggable={canDrag(i) && !(key(i) in pending)}>
                  {renderCard(i)}
                </Card>
              ))}
              {!here.length && <p className="px-1 py-3 text-center text-xs text-muted">{col.empty ?? "Empty"}</p>}
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18,0.67,0.6,1.22)" }}>
        {active ? <div className="rotate-1 cursor-grabbing shadow-lg">{renderCard(active)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
