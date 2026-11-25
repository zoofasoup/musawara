// A searchable picker in a popover: one trigger button, a search box and a scrolling list of options (optionally grouped, with counts and a
// one-line hint). Single or multiple choice. Replaces walls of toggle chips: only what is chosen is shown on the page, the rest lives in here.
import * as React from "react"
import { Check } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type PickItem = { value: string; label: string; hint?: string; count?: number; group?: string }

export function Picker({ items, value, onChange, multiple = true, label, searchPlaceholder = "Search…", emptyText = "Nothing found", children, triggerClassName, align = "start", onPicked }: {
  items: PickItem[]
  value: string[]
  onChange: (next: string[]) => void
  multiple?: boolean
  label: string
  searchPlaceholder?: string
  emptyText?: string
  children: React.ReactNode
  triggerClassName?: string
  align?: "start" | "center" | "end"
  onPicked?: (item: PickItem) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState("")
  const [active, setActive] = React.useState(0)
  const listId = React.useId()
  const needle = q.trim().toLowerCase()
  const shown = React.useMemo(
    () => items.filter((i) => !needle || `${i.label} ${i.hint ?? ""} ${i.group ?? ""}`.toLowerCase().includes(needle)).slice(0, 200),
    [items, needle]
  )
  const pick = (item: PickItem) => {
    if (multiple) onChange(value.includes(item.value) ? value.filter((v) => v !== item.value) : [...value, item.value])
    else { onChange([item.value]); setOpen(false) }
    onPicked?.(item)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === "Enter") { e.preventDefault(); const i = shown[active]; if (i) pick(i) }
  }
  let lastGroup: string | undefined
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setQ(""); setActive(0) } }}>
      <PopoverTrigger aria-label={label} className={cn("press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm text-ink hover:bg-surface2 md:min-h-9", triggerClassName)}>
        {children}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 max-w-[92vw] gap-0 rounded-2xl p-0">
        <input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-label={searchPlaceholder}
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0) }}
          onKeyDown={onKey}
          placeholder={searchPlaceholder}
          className="min-h-11 w-full rounded-t-2xl border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted"
        />
        <ul id={listId} role="listbox" aria-multiselectable={multiple} className="max-h-72 overflow-y-auto p-1">
          {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted">{emptyText}</li>}
          {shown.map((i, idx) => {
            const on = value.includes(i.value)
            const head = i.group && i.group !== lastGroup ? i.group : null
            lastGroup = i.group
            return (
              <React.Fragment key={i.value}>
                {head && <li role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">{head}</li>}
                <li
                  role="option"
                  aria-selected={on}
                  onMouseDown={(e) => { e.preventDefault(); pick(i) }}
                  onMouseEnter={() => setActive(idx)}
                  className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 py-1.5 text-sm md:min-h-9", idx === active && "bg-surface2")}
                >
                  {multiple && <span className={cn("inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]" : "border-border")}>{on && <Check className="h-3 w-3" aria-hidden />}</span>}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate", !multiple && on && "font-semibold")}>{i.label}</span>
                    {i.hint && <span className="block truncate text-xs text-muted">{i.hint}</span>}
                  </span>
                  {i.count !== undefined && <span className="tnum shrink-0 text-xs text-muted">{i.count.toLocaleString("en-US")}</span>}
                </li>
              </React.Fragment>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
