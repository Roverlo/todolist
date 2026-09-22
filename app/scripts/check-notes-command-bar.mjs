import assert from 'node:assert/strict';

export async function checkNotesCommandBar(page, width, { contextual = false } = {}) {
    const layout = await page.locator('.notes-main-root').evaluate(root => {
        const rect = selector => {
            const { x, y, width, height, right, bottom } = root.querySelector(selector).getBoundingClientRect();
            return { x, y, width, height, right, bottom };
        };
        const toolbar = rect('[role="toolbar"]');
        const groupsFit = [...root.querySelectorAll('.editor-toolbar-row')].every(row => {
            const groups = [...row.children].map(group => group.getBoundingClientRect());
            return groups.every((group, i) => !i || group.top >= groups[i - 1].bottom - 1 || group.left >= groups[i - 1].right - 1);
        });
        return {
            root: rect('.notes-command-bar'), toolbar, panel: rect('.notes-center-ai-panel'), document: rect('.notes-document'), ai: rect('.notes-ai-tools'),
            tasks: rect('[aria-label="一键生成待办事项"]'), weekly: rect('[aria-label="一键生成周报"]'),
            headingIcons: root.querySelectorAll('#notes-ai-heading svg').length,
            rowEdges: [...root.querySelectorAll('.editor-toolbar-row')].map(row => ({ left: row.firstElementChild.getBoundingClientRect().left, right: row.lastElementChild.getBoundingClientRect().right })),
            controlsFit: groupsFit && [...root.querySelectorAll('[role="toolbar"] button')].every(control => {
                const r = control.getBoundingClientRect();
                return !r.width || !r.height || r.left >= toolbar.x - 1 && r.right <= toolbar.right + 1 && r.top >= toolbar.y && r.bottom <= toolbar.bottom;
            }),
        };
    });
    assert.ok(Math.abs(layout.tasks.width - layout.weekly.width) <= 1 && layout.tasks.height === layout.weekly.height && layout.tasks.y === layout.weekly.y,
        `AI actions must be equal peers at ${width}px: ${JSON.stringify(layout)}`);
    assert.ok(layout.weekly.right <= width && layout.root.x >= 0);
    assert.equal(layout.headingIcons, 0, 'The AI heading has no decorative star');
    assert.equal(layout.controlsFit, true, `Toolbar groups and controls must be reachable at ${width}px: ${JSON.stringify(layout)}`);
    assert.ok(layout.toolbar.height <= (contextual ? 122 : 86), `Compact toolbar height at ${width}px: ${layout.toolbar.height}`);
    assert.ok(Math.abs(layout.panel.y - layout.document.y) <= 1 && Math.abs(layout.panel.y - layout.root.bottom) <= 1, 'Document and assistant start together');
    if (layout.root.width > 1200) {
        assert.ok(Math.abs(layout.ai.x - layout.panel.x) <= 1 && Math.abs(layout.ai.right - layout.panel.right) <= 1, 'AI commands align with the side panel');
        if (!contextual) assert.ok(Math.abs(layout.rowEdges[0].left - layout.rowEdges[1].left) <= 1 && Math.abs(layout.rowEdges[0].right - layout.rowEdges[1].right) <= 1, 'Both toolbar rows share their edges');
    }
    for (const name of ['未完成在前', '已完成在前', '引用', '插入日期']) {
        assert.equal(await page.getByRole('toolbar').getByRole('button', { name, exact: true }).isVisible(), true);
    }
}
