import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

interface SelectContextType {
  value?: string
  onValueChange?: (value: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const SelectContext = React.createContext<SelectContextType>({})

interface SelectProps {
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  defaultValue?: string
}

const Select: React.FC<SelectProps> = ({ value, onValueChange, children, defaultValue }) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue || '')
  const [open, setOpen] = React.useState(false)

  const currentValue = value !== undefined ? value : internalValue

  const handleValueChange = React.useCallback((newValue: string) => {
    if (value === undefined) {
      setInternalValue(newValue)
    }
    onValueChange?.(newValue)
  }, [value, onValueChange])

  const handleOpenChange = React.useCallback((newOpen: boolean) => {
    setOpen(newOpen)
  }, [])

  return (
    <SelectContext.Provider value={{
      value: currentValue,
      onValueChange: handleValueChange,
      open,
      onOpenChange: handleOpenChange
    }}>
      {children}
    </SelectContext.Provider>
  )
}

const SelectGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("", className)} {...props} />
))
SelectGroup.displayName = "SelectGroup"

const useSelectContext = () => {
  const context = React.useContext(SelectContext)
  if (!context) {
    throw new Error('Select components must be used within a Select component')
  }
  return context
}

const SelectValue = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { placeholder?: string; children?: React.ReactNode }
>(({ className, placeholder, children, ...props }, ref) => {
  const { value } = useSelectContext()
  return (
    <span ref={ref} className={cn("block truncate", className)} {...props}>
      {children || getDisplayValue(value, placeholder)}
    </span>
  )
})
SelectValue.displayName = "SelectValue"

// Helper function to get display value
const getDisplayValue = (value: string, placeholder?: string) => {
  if (!value) return placeholder || ''

  // For revenue/expense type
  if (value === 'revenue') return 'Pemasukan'
  if (value === 'expense') return 'Pengeluaran'

  // For category ID, we need to find the category name
  // This is a limitation - the SelectValue component doesn't have access to categories
  // So we'll return the value for now and fix this in the accounting page
  return value
}

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const { open, onOpenChange } = useSelectContext()

  const handleClick = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newOpen = !open
    onOpenChange?.(newOpen)
  }, [open, onOpenChange])

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border bg-white dark:bg-gray-800 px-3 py-2 text-sm placeholder:text-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      onClick={handleClick}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  )
})
SelectTrigger.displayName = "SelectTrigger"

const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const { open, onOpenChange, value, onValueChange } = useSelectContext()

  if (!open) {
    return null
  }

  const handleOverlayClick = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onOpenChange?.(false)
  }, [onOpenChange])

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black bg-opacity-20"
        onClick={handleOverlayClick}
      />
      <div
        ref={ref}
        className={cn(
          "absolute z-50 max-h-60 min-w-[8rem] overflow-hidden rounded-md border bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-lg border-gray-300 dark:border-gray-600",
          "top-full left-0 right-0 mt-1 w-full",
          className
        )}
        onClick={(e) => e.stopPropagation()}
        {...props}
      >
        <div className="p-1">
          {React.Children.map(children, child => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child, {
                currentValue: value,
                onValueChange: (newValue: string) => {
                  onValueChange?.(newValue)
                }
              } as any)
            }
            return child
          })}
        </div>
      </div>
    </>
  )
})
SelectContent.displayName = "SelectContent"

const SelectLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)}
    {...props}
  />
))
SelectLabel.displayName = "SelectLabel"

const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, children, value: itemValue, ...props }, ref) => {
  const { onValueChange, onOpenChange, value: currentValue } = useSelectContext()

  const handleClick = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onOpenChange?.(false)
    onValueChange?.(itemValue)
  }, [itemValue, onValueChange, onOpenChange])

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        currentValue === itemValue && "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300",
        className
      )}
      onClick={handleClick}
      {...props}
    >
      {currentValue === itemValue && (
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center text-primary">
          ✓
        </span>
      )}
      {children}
    </div>
  )
})
SelectItem.displayName = "SelectItem"

const SelectSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-gray-200", className)}
    {...props}
  />
))
SelectSeparator.displayName = "SelectSeparator"

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
}