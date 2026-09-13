import { cloneElement, forwardRef, useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ComponentProps, type Dispatch, type KeyboardEventHandler, type ReactElement, type ReactNode, type RefObject, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import './EditorToolbarControls.css';

export function EditorTooltip({ label, description, shortcut, children }: {
    label: string; description?: string; shortcut?: string;
    children: ReactElement<{ 'aria-describedby'?: string }>;
}) {
    const id = useId();
    const anchorRef = useRef<HTMLSpanElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
    const clearTimer = useCallback(() => { if (timer.current) clearTimeout(timer.current); }, []);
    const hide = useCallback(() => { clearTimer(); setPosition(null); }, [clearTimer]);
    const show = () => {
        clearTimer();
        const anchor = anchorRef.current;
        if (!anchor || anchor.querySelector('[aria-expanded="true"]')) return;
        const rect = anchor.getBoundingClientRect();
        setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)),
            top: rect.bottom + 100 > window.innerHeight ? Math.max(8, rect.top - 92) : rect.bottom + 8 });
    };
    const leave = () => { clearTimer(); timer.current = setTimeout(hide, 120); };

    useEffect(() => clearTimer, [clearTimer]);
    useEffect(() => {
        if (!position) return;
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
        document.addEventListener('keydown', escape);
        document.addEventListener('pointerdown', hide);
        window.addEventListener('resize', hide);
        window.addEventListener('scroll', hide, true);
        return () => {
            document.removeEventListener('keydown', escape);
            document.removeEventListener('pointerdown', hide);
            window.removeEventListener('resize', hide);
            window.removeEventListener('scroll', hide, true);
        };
    }, [position, hide]);

    return <span className="editor-control" ref={anchorRef}
        onPointerEnter={event => {
            if (event.pointerType === 'touch') return;
            clearTimer(); timer.current = setTimeout(show, 350);
        }} onPointerLeave={leave} onPointerDownCapture={hide}
        onFocusCapture={event => { if (event.target.matches(':focus-visible')) show(); }} onBlurCapture={hide}>
        {cloneElement(children, { 'aria-describedby': position ? id : undefined })}
        {position && createPortal(<div id={id} role="tooltip" className="editor-tooltip" style={position}
            onPointerEnter={clearTimer} onPointerLeave={leave}>
            <div className="editor-tooltip-heading"><span>{label}</span>{shortcut && <kbd>{shortcut}</kbd>}</div>
            {description && <p>{description}</p>}
        </div>, document.body)}
    </span>;
}

interface EditorToolButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'aria-label'> {
    label: string;
    icon: LucideIcon;
    description?: string;
    shortcut?: string;
    active?: boolean;
}

export const EditorToolButton = forwardRef<HTMLButtonElement, EditorToolButtonProps>(function EditorToolButton({
    label, icon: Icon, description, shortcut, active, className = '', children, onMouseDown, ...props
}, ref) {
    return <EditorTooltip label={label} description={description} shortcut={shortcut}>
        <button {...props} ref={ref} type="button" className={`editor-tool-button ${className}`}
            aria-label={label} aria-pressed={active} data-state={active === undefined ? undefined : active ? 'on' : 'off'}
            onMouseDown={event => { event.preventDefault(); onMouseDown?.(event); }}>
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />{children}
        </button>
    </EditorTooltip>;
});

export function EditorSelect({ description, ...props }: ComponentProps<typeof CustomSelect> & { description?: string }) {
    return <EditorTooltip label={props['aria-label'] || props.placeholder || '选择格式'} description={description}>
        <CustomSelect {...props} />
    </EditorTooltip>;
}

export function EditorPopover({ label, triggerRef, setOpen, initialFocus = 'button:not(:disabled), input', className = '', children, onKeyDown }: {
    label: string; triggerRef: RefObject<HTMLButtonElement | null>; setOpen: Dispatch<SetStateAction<boolean>>;
    initialFocus?: string; className?: string; children: ReactNode; onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}) {
    const popoverRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        (popoverRef.current?.querySelector<HTMLElement>(initialFocus)
            || popoverRef.current?.querySelector<HTMLElement>('button:not(:disabled), input'))?.focus();
        const outside = (event: PointerEvent) => {
            if (!popoverRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault(); event.stopPropagation();
            setOpen(false); triggerRef.current?.focus();
        };
        const focusOutside = (event: FocusEvent) => {
            if (!popoverRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', escape);
        document.addEventListener('focusin', focusOutside);
        return () => {
            document.removeEventListener('pointerdown', outside);
            document.removeEventListener('keydown', escape);
            document.removeEventListener('focusin', focusOutside);
        };
    }, [initialFocus, setOpen, triggerRef]);
    return <div ref={popoverRef} className={`editor-popover ${className}`} role="dialog" aria-label={label} onKeyDown={onKeyDown}>{children}</div>;
}
