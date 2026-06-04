'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface SearchBarProps {
  onSearch?: (query: string) => void
  placeholder?: string
  delay?: number
  className?: string
  onSearchChange?: (isSearching: boolean) => void
}

/**
 * SearchBar component yang men-handle search sendiri
 * Tidak memicu re-render di parent karena menggunakan internal state
 */
export const SearchBar = React.memo<SearchBarProps>(({
  placeholder = 'Cari...',
  delay = 500,
  className = '',
  onSearch,
  onSearchChange
}) => {
  const [inputValue, setInputValue] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout>()

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Show searching state
    setIsSearching(true)
    onSearchChange?.(true)

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      // Trigger search di parent
      onSearch?.(newValue)
      setIsSearching(false)
      onSearchChange?.(false)
    }, delay)
  }

  const handleClear = () => {
    setInputValue('')
    setIsSearching(false)
    onSearch?.('')
    onSearchChange?.(false)
  }

  return (
    <div className={`relative flex-1 ${className}`}>
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        placeholder={placeholder}
        value={inputValue}
        onChange={handleChange}
        className="pl-10 pr-10"
      />
      {isSearching && (
        <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
      )}
      {inputValue && !isSearching && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-xs"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  )
})

SearchBar.displayName = 'SearchBar'
