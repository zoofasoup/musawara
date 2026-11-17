import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"
import { controlCls } from "./control"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(controlCls, "py-1 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium", className)}
      {...props}
    />
  )
}

export { Input }
