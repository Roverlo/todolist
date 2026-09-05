import { useState, useRef, useEffect, useId, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './CustomSelect.css';

interface Option { value: string; label: string; disabled?: boolean }
interface CustomSelectProps {
  value: string | number;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

export const CustomSelect = ({ value, options, onChange, placeholder, className, 'aria-label': label }: CustomSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedOption = options.find(opt => opt.value === String(value));

  useEffect(() => {
    if (!isOpen) return;
    const place = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 160), window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 14;
      const above = below < Math.min(240, options.length * 34 + 12) && rect.top > below;
      setPosition({ width, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: above ? undefined : rect.bottom + 6, bottom: above ? window.innerHeight - rect.top + 6 : undefined,
        maxHeight: Math.min(280, above ? rect.top - 14 : below) });
    };
    const closeOutside = (event: MouseEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    place();
    document.addEventListener('mousedown', closeOutside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [isOpen, options.length]);

  useEffect(() => {
    if (isOpen) menuRef.current?.querySelector('[data-index="' + activeIndex + '"]')?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, activeIndex]);

  const openMenu = () => {
    const selected = options.findIndex(opt => opt.value === String(value) && !opt.disabled);
    setActiveIndex(selected >= 0 ? selected : Math.max(0, options.findIndex(opt => !opt.disabled)));
    setIsOpen(true);
  };
  const choose = (option: Option) => { onChange(option.value); setIsOpen(false); };

  return (
    <div className={['custom-select-container', className].filter(Boolean).join(' ')}>
      <button type="button" ref={triggerRef} className={'custom-select-trigger' + (isOpen ? ' is-open' : '')}
        role="combobox" aria-label={label || placeholder || '请选择'} aria-expanded={isOpen}
        aria-controls={listId} aria-haspopup="listbox" aria-activedescendant={isOpen ? listId + '-' + activeIndex : undefined}
        onClick={() => isOpen ? setIsOpen(false) : openMenu()}
        onKeyDown={event => {
          if (event.key === 'Escape' && isOpen) { event.preventDefault(); event.stopPropagation(); setIsOpen(false); return; }
          if (event.key === 'Tab') { setIsOpen(false); return; }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            if (!isOpen) { openMenu(); return; }
            const enabled = options.map((opt, i) => opt.disabled ? -1 : i).filter(i => i >= 0);
            const index = enabled.indexOf(activeIndex);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
            if (enabled.length) setActiveIndex(enabled[next]);
          } else if ((event.key === 'Enter' || event.key === ' ') && isOpen) {
            event.preventDefault();
            const option = options[activeIndex];
            if (option && !option.disabled) choose(option);
          }
        }}>
        <span className="custom-select-value">{selectedOption?.label || placeholder || '请选择'}</span>
        <ChevronDown size={14} className="custom-select-arrow" aria-hidden="true" />
      </button>
      {isOpen && createPortal(
        <div className="custom-select-dropdown" id={listId} role="listbox" aria-label={label || placeholder || '请选择'}
          ref={menuRef} style={position}>
          {options.map((option, index) => (
            <button type="button" key={option.value} id={listId + '-' + index} role="option" tabIndex={-1} data-index={index} data-value={option.value}
              aria-selected={option.value === String(value)} disabled={option.disabled}
              className={['custom-select-option', option.value === String(value) && 'is-selected', index === activeIndex && 'is-active'].filter(Boolean).join(' ')}
              onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}>
              {option.label}{option.value === String(value) && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>, document.body
      )}
    </div>
  );
};
