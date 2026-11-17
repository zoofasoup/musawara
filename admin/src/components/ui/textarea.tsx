import * as React from "react"
import { cn } from "@/lib/utils"
import { controlCls } from "./control"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(controlCls, "min-h-20 py-2 md:min-h-20", className)} {...props} />
}

export { Textarea }
