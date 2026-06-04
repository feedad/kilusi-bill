'use client'

import { useState, useEffect, useRef } from 'react'

interface UseDebounceSearchOptions {
  delay?: number
  onSearch?: (query: string) => void
  immediate?: boolean
}

interface UseDebounceSearchReturn {
  searchQuery: string
  searchInput: string
  setSearchInput: (value: string) => void
  clearSearch: () => void
  isSearching: boolean
}

export function useDebounceSearch(options: UseDebounceSearchOptions = {}): UseDebounceSearchReturn {
  const { delay = 500, onSearch, immediate = false } = options

  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  const timeoutRef = useRef<NodeJS.Timeout>()
  const isFirstRender = useRef(true)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      if (immediate && searchInput) {
        setSearchQuery(searchInput)
        onSearch?.(searchInput)
      }
      return
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    if (searchInput === '') {
      setSearchQuery('')
      onSearch?.('')
      setIsSearching(false)
      return
    }

    setIsSearching(true)

    timeoutRef.current = setTimeout(() => {
      setSearchQuery(searchInput)
      onSearch?.(searchInput)
      setIsSearching(false)
    }, delay)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [searchInput, delay, onSearch, immediate])

  const clearSearch = () => {
    setSearchInput('')
    setSearchQuery('')
    onSearch?.('')
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsSearching(false)
  }

  return {
    searchQuery,
    searchInput,
    setSearchInput,
    clearSearch,
    isSearching
  }
}

export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timeout)
    }
  }, [value, delay])

  return debouncedValue
}
