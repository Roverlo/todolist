import { useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Table } from 'lucide-react';
import { EditorPopover, EditorToolButton } from './EditorToolbarControls';

const GRID_SIZE = 10;

export function EditorTablePicker({ editor }: { editor: Editor }) {
    const [open, setOpen] = useState(false);
    const [size, setSize] = useState({ rows: 3, cols: 3 });
    const [withHeaderRow, setWithHeaderRow] = useState(true);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const insert = (rows: number, cols: number, header = withHeaderRow) => {
        setOpen(false);
        editor.chain().focus().insertTable({ rows, cols, withHeaderRow: header }).run();
    };
    const openPicker = () => { setSize({ rows: 3, cols: 3 }); setWithHeaderRow(true); setOpen(true); };
    return <div className="editor-popover-anchor">
        <EditorToolButton ref={triggerRef} icon={Table} label="插入表格" description="点击选择行列；回车快速插入 3 × 3 表格，向下键打开选择器。"
            shortcut="Enter / ↓" aria-haspopup="dialog" aria-expanded={open}
            disabled={!editor.can().insertTable()} onClick={() => open ? setOpen(false) : openPicker()}
            onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); insert(3, 3, true); }
                if (event.key === 'ArrowDown') { event.preventDefault(); openPicker(); }
            }} />
        {open && <EditorPopover label="选择表格大小" triggerRef={triggerRef} setOpen={setOpen} initialFocus="[data-rows='3'][data-cols='3']">
            <div className="editor-popover-heading"><strong>插入表格</strong><span role="status">{size.rows} 行 × {size.cols} 列</span></div>
            <div className="editor-table-grid" role="group" aria-label="表格行列"
                onKeyDown={event => {
                    if (!(event.target instanceof HTMLButtonElement)) return;
                    const row = Number(event.target.dataset.rows), col = Number(event.target.dataset.cols);
                    const rows = event.key === 'ArrowUp' ? Math.max(1, row - 1) : event.key === 'ArrowDown' ? Math.min(GRID_SIZE, row + 1) : row;
                    const cols = event.key === 'ArrowLeft' ? Math.max(1, col - 1) : event.key === 'ArrowRight' ? Math.min(GRID_SIZE, col + 1)
                        : event.key === 'Home' ? 1 : event.key === 'End' ? GRID_SIZE : col;
                    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    event.currentTarget.querySelector<HTMLButtonElement>(`[data-rows="${rows}"][data-cols="${cols}"]`)?.focus();
                }}>
                {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
                    const rows = Math.floor(index / GRID_SIZE) + 1, cols = index % GRID_SIZE + 1;
                    return <button key={index} type="button" data-table-grid-cell data-rows={rows} data-cols={cols}
                        aria-label={`${rows} 行 ${cols} 列`} data-highlighted={rows <= size.rows && cols <= size.cols}
                        tabIndex={rows === size.rows && cols === size.cols ? 0 : -1}
                        onFocus={() => setSize({ rows, cols })} onPointerEnter={() => setSize({ rows, cols })}
                        onPointerDown={event => event.preventDefault()}
                        onPointerUp={event => { if (event.button === 0) insert(rows, cols); }}
                        onClick={event => { if (event.detail === 0) insert(rows, cols); }} />;
                })}
            </div>
            <label className="editor-table-options"><input type="checkbox" checked={withHeaderRow} onChange={event => setWithHeaderRow(event.target.checked)} />首行作为表头</label>
            <p className="editor-table-hint">方向键选择大小，Enter 插入，Esc 取消。</p>
        </EditorPopover>}
    </div>;
}
