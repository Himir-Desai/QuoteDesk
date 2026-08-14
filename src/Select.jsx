import React, { useState, useRef, useEffect, useMemo } from 'react'

/**
 * A dropdown we render ourselves — so the open list is styled like the rest of
 * the app (a native <select> popup is drawn by the OS and can't be). It does
 * three jobs through props:
 *   - single-select (default) or `multiple` (checkboxes, stays open)
 *   - optional `searchable` filter box pinned at the top of the menu
 *   - options may carry a colour swatch (used for sellers)
 *
 * options: [{ value, label, color? }]
 * value:   string (single) | string[] (multiple)
 * onChange: (value) | (value[])
 */
export default function Select({
  value,
  onChange,
  options,
  placeholder = 'All',
  clearable = true,
  multiple = false,
  searchable = false,
  formatSummary,
  disabled = false,
  className = '',
  title
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [q, setQ] = useState('')
  const rootRef = useRef(null)
  const menuRef = useRef(null)
  const searchRef = useRef(null)

  const selectedArr = multiple ? value || [] : []
  const selectedSet = useMemo(() => new Set(selectedArr), [selectedArr])

  const base = useMemo(() => {
    if (multiple) return options
    return clearable ? [{ value: '', label: placeholder }, ...options] : options
  }, [options, multiple, clearable, placeholder])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return base
    return base.filter((o) => o.label.toLowerCase().includes(t))
  }, [q, base])

  const selectedSingle =
    base.find((o) => o.value === value) || base[0] || { label: placeholder }

  const hasValue = multiple ? selectedArr.length > 0 : Boolean(value)
  const btnLabel = multiple
    ? formatSummary
      ? formatSummary(selectedArr)
      : hasValue
        ? `${selectedArr.length} selected`
        : placeholder
    : selectedSingle.label
  const btnColor = multiple ? null : selectedSingle.color

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // On open: clear search, highlight the current selection, focus the filter.
  useEffect(() => {
    if (!open) {
      setQ('')
      return
    }
    if (!multiple) {
      const i = base.findIndex((o) => o.value === value)
      setActive(i < 0 ? 0 : i)
    } else setActive(0)
    if (searchable) setTimeout(() => searchRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  useEffect(() => {
    if (!open) return
    menuRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const commit = (opt) => {
    if (multiple) {
      const next = new Set(selectedSet)
      next.has(opt.value) ? next.delete(opt.value) : next.add(opt.value)
      onChange([...next])
    } else {
      onChange(opt.value)
      setOpen(false)
    }
  }

  const openKey = (e) => {
    if (disabled) return
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    navKey(e)
  }

  const navKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(filtered.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[active]) commit(filtered[active])
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div
      className={`sel ${open ? 'open' : ''} ${disabled ? 'sel-disabled' : ''} ${className}`}
      ref={rootRef}
    >
      <button
        type="button"
        className={`sel-btn ${hasValue ? 'is-set' : ''}`}
        title={title}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={openKey}
      >
        {btnColor && (
          <span className="sel-dot" style={{ background: btnColor }} />
        )}
        <span className="sel-value">{btnLabel}</span>
        <svg className="sel-chevron" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="sel-menu" ref={menuRef}>
          {searchable && (
            <div className="sel-search">
              <svg className="sel-search-icon" viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="9" cy="9" r="6" />
                <line x1="13.5" y1="13.5" x2="18" y2="18" />
              </svg>
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={navKey}
                placeholder="Search…"
              />
            </div>
          )}

          <ul className="sel-list" role="listbox" aria-multiselectable={multiple}>
            {filtered.length === 0 && <li className="sel-noopt">No matches</li>}
            {filtered.map((opt, i) => {
              const on = multiple ? selectedSet.has(opt.value) : opt.value === value
              return (
                <li
                  key={opt.value || '_all'}
                  role="option"
                  aria-selected={on}
                  data-active={i === active}
                  className={`sel-option ${i === active ? 'active' : ''} ${
                    on ? 'selected' : ''
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(opt)}
                >
                  {multiple && (
                    <span className={`sel-box ${on ? 'on' : ''}`}>
                      {on ? '✓' : ''}
                    </span>
                  )}
                  {opt.color ? (
                    <span className="sel-dot" style={{ background: opt.color }} />
                  ) : (
                    !multiple && <span className="sel-dot sel-dot-none" />
                  )}
                  <span className="sel-option-label">{opt.label}</span>
                  {!multiple && on && <span className="sel-check">✓</span>}
                </li>
              )
            })}
          </ul>

          {multiple && (
            <div className="sel-foot">
              <button
                type="button"
                className="sel-linkbtn"
                disabled={!selectedArr.length}
                onClick={() => onChange([])}
              >
                Clear
              </button>
              <span className="sel-foot-count">{selectedArr.length} selected</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
