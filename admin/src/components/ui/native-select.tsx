import * as React from "react"
import { cn } from "@/lib/utils"
import { controlCls } from "./control"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./select"

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default"
}

type Opt = { value: string; label: React.ReactNode; disabled?: boolean }
type Group = { label?: React.ReactNode; options: Opt[] }

/** Option element → plain data. Accepts <option>, <optgroup>, fragments and mapped arrays, like a real <select>. */
function collect(children: React.ReactNode, groups: Group[] = [], current?: Group): Group[] {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const el = child as React.ReactElement<any>
    if (el.type === React.Fragment) {
      collect(el.props.children, groups, current)
    } else if (el.type === "optgroup" || el.type === NativeSelectOptGroup) {
      const g: Group = { label: el.props.label, options: [] }
      groups.push(g)
      collect(el.props.children, groups, g)
    } else if (el.type === "option" || el.type === NativeSelectOption) {
      const label = el.props.children
      const value = el.props.value !== undefined ? String(el.props.value) : typeof label === "string" ? label : React.Children.toArray(label).join("")
      let g = current
      if (!g) {
        g = groups[groups.length - 1]?.label === undefined ? groups[groups.length - 1] : undefined
        if (!g) { g = { options: [] }; groups.push(g) }
      }
      g.options.push({ value, label, disabled: el.props.disabled })
    }
  })
  return groups
}

/**
 * The site's dropdown. Written like a native <select> (<option> children, value, onChange(e) with e.target.value),
 * but drawn with our own popup so it matches the rest of the UI. `className` sizes the wrapper
 * ("w-full", "sm:w-auto"), so pass layout classes only; the styling lives here.
 */
function NativeSelect({ className, size = "default", children, value, defaultValue, onChange, name, required, disabled, id, ...aria }: NativeSelectProps) {
  const groups = React.useMemo(() => collect(children), [children])
  const items = groups.flatMap((g) => g.options)
  const controlled = value !== undefined
  const [inner, setInner] = React.useState(() => (defaultValue !== undefined ? String(Array.isArray(defaultValue) ? defaultValue[0] : defaultValue) : (items[0]?.value ?? "")))
  const current = controlled ? String(value) : inner
  const shown = items.find((o) => o.value === current)

  return (
    <div className={cn("relative w-fit", className)} data-slot="native-select-wrapper" data-size={size}>
      <Select
        value={current}
        name={name}
        required={required}
        disabled={disabled}
        items={items.map((o) => ({ value: o.value, label: o.label }))}
        onValueChange={(v) => {
          const next = v == null ? "" : String(v)
          if (!controlled) setInner(next)
          const target = { value: next, name: name ?? "" }
          onChange?.({ target, currentTarget: target } as unknown as React.ChangeEvent<HTMLSelectElement>)
        }}
      >
        <SelectTrigger
          id={id}
          aria-label={aria["aria-label"]}
          aria-labelledby={aria["aria-labelledby"]}
          aria-invalid={aria["aria-invalid"] as any}
          data-slot="native-select"
          className={cn(controlCls, "h-auto w-full justify-between gap-2 py-1 pr-2.5 text-left", size === "sm" && "min-h-9 text-xs md:min-h-9")}
        >
          <SelectValue className="min-w-0 flex-1 truncate">{shown ? shown.label : ""}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {groups.map((g, i) => {
            const rows = g.options.map((o) => (
              <SelectItem key={o.value + "|" + i} value={o.value} disabled={o.disabled}>{o.label}</SelectItem>
            ))
            return g.label ? (
              <SelectGroup key={i}>
                <SelectLabel>{g.label}</SelectLabel>
                {rows}
              </SelectGroup>
            ) : (
              <React.Fragment key={i}>{rows}</React.Fragment>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )
}

function NativeSelectOption(props: React.ComponentProps<"option">) {
  return <option {...props} />
}

function NativeSelectOptGroup(props: React.ComponentProps<"optgroup">) {
  return <optgroup {...props} />
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
