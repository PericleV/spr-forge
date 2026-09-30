import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  addEdge,
  Background,
  ConnectionLineType,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type IsValidConnection,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './App.css';
import { EngineContext, useEngine } from './engine/engine.ts';
import { canConnect, isMultiInput, PORT_COLORS, sourcePort } from './engine/ports.ts';
import {
  ANALYSIS_DEFAULTS,
  COMPARE_DEFAULTS,
  DRAW_DEFAULTS,
  FIELD_DEFAULTS,
  fitDefaults,
  materialData,
  OBJECTIVE_DEFAULTS,
  OPTIMIZER_DEFAULTS,
  PLOT_DEFAULTS,
  VARIABLE_DEFAULTS,
  ZONES_DEFAULTS,
  IMPORT_DEFAULTS,
  TARGET_DEFAULTS,
  MATCH_DEFAULTS,
  FORMULA_DEFAULTS,
  INFO_DEFAULTS,
  REVERSE_DEFAULTS,
  ROUGH_DEFAULTS,
  TOLERANCE_DEFAULTS,
  GRATING_DEFAULTS,
  RCWA_DEFAULTS,
  DRAWGRATING_DEFAULTS,
  RCWAFIELD_DEFAULTS,
  ANISO_DEFAULTS,
  NOTES_DEFAULTS,
} from './defaults.ts';
import { LibraryContext, type LibraryState } from './library/context.ts';
import { NODE_HELP } from './help.ts';
import { Logo } from './Logo.tsx';
import { DRAG_TYPE, NodePalette, type PaletteGroup } from './NodePalette.tsx';
// side panels: separate chunks, loaded when first opened
const LibraryPanel = lazy(() => import('./library/LibraryPanel.tsx').then((m) => ({ default: m.LibraryPanel })));
const ProjectsPanel = lazy(() => import('./ProjectsPanel.tsx').then((m) => ({ default: m.ProjectsPanel })));
const HelpPanel = lazy(() => import('./HelpPanel.tsx').then((m) => ({ default: m.HelpPanel })));
import { BUILTINS, makeLibrary } from './physics/library.ts';
import type { MaterialDef } from './physics/materials.ts';
import { download } from './plot/export.ts';
import { ContextMenu, type MenuAction, type MenuItem, type MenuState } from './ContextMenu.tsx';
import { groupNodes, releaseChildren, removeFromGroup, ungroup } from './groups.ts';
import { useHistory } from './history.ts';
import { editCaption } from './nodes/captionStore.ts';
import { FlowEdge } from './FlowEdge.tsx';
import { withShell } from './nodes/NodeShell.tsx';
import { FrameNodeView } from './nodes/FrameNode.tsx';
import { applyTheme, loadPrefs, loadTheme, savePrefs, STEPS, type CanvasPrefs, type Theme } from './theme.ts';
import { autosave, decodeProject, keepLastSession, parseProject, stringifyProject, toProject, type Project } from './project.ts';
import { ExtremumNodeView, FwhmNodeView, SensitivityNodeView } from './nodes/AnalysisNodes.tsx';
import { CompareNodeView } from './nodes/CompareNode.tsx';
import { FieldNodeView } from './nodes/FieldNode.tsx';
import { FitNodeView } from './nodes/FitNode.tsx';
import { ObjectiveNodeView, VariableNodeView, ZonesNodeView } from './nodes/ObjectiveNodes.tsx';
import { ImportNodeView, MatchNodeView, TargetNodeView } from './nodes/TargetNodes.tsx';
import { FormulaNodeView, InfoNodeView } from './nodes/NoteNodes.tsx';
import { ReverseNodeView } from './nodes/StackNodes.tsx';
import { RoughNodeView } from './nodes/RoughNode.tsx';
import { FilterNodeView } from './nodes/FilterNode.tsx';
import { ToleranceNodeView } from './nodes/ToleranceNode.tsx';
import { DrawGratingNodeView, GratingNodeView, RcwaNodeView } from './nodes/RcwaNodes.tsx';
import { RcwaFieldNodeView } from './nodes/RcwaFieldNode.tsx';
import { CustomNodeView, ExtractNodeView, MergeNodeView } from './nodes/DataNodes.tsx';
import { FILTER_DEFAULTS } from './engine/filters.ts';
import { FRAME_COLORS, GROUP_COLORS, NODE_COLORS, nodeColor, nodeTitle } from './nodeColors.ts';
import { OptimizerNodeView } from './nodes/OptimizerNode.tsx';
import { ComputeNodeView } from './nodes/ComputeNode.tsx';
import { DrawNodeView } from './nodes/DrawNode.tsx';
import { ParamNodeView, SweepNodeView } from './nodes/InputNodes.tsx';
import { AnisoNodeView, LayerNodeView, MaterialNodeView, MaterialSweepNodeView } from './nodes/MaterialNodes.tsx';
import { PlotNodeView } from './nodes/PlotNode.tsx';
import { NotesNodeView } from './nodes/NotesNode.tsx';
import { Welcome } from './Welcome.tsx';
import { FindNode } from './FindNode.tsx';
import { welcomeSeen } from './welcomeState.ts';
import { CombineNodeView, DbrNodeView } from './nodes/StackNodes.tsx';
import type { AppNode } from './types.ts';

const baseNodeTypes = {
  material: MaterialNodeView,
  matsweep: MaterialSweepNodeView,
  aniso: AnisoNodeView,
  notes: NotesNodeView,
  layer: LayerNodeView,
  combine: CombineNodeView,
  dbr: DbrNodeView,
  param: ParamNodeView,
  sweep: SweepNodeView,
  compute: ComputeNodeView,
  plot: PlotNodeView,
  compare: CompareNodeView,
  draw: DrawNodeView,
  extremum: ExtremumNodeView,
  fwhm: FwhmNodeView,
  sensitivity: SensitivityNodeView,
  fit: FitNodeView,
  field: FieldNodeView,
  variable: VariableNodeView,
  objective: ObjectiveNodeView,
  zones: ZonesNodeView,
  optimizer: OptimizerNodeView,
  import: ImportNodeView,
  target: TargetNodeView,
  match: MatchNodeView,
  formula: FormulaNodeView,
  info: InfoNodeView,
  reverse: ReverseNodeView,
  rough: RoughNodeView,
  filter: FilterNodeView,
  tolerance: ToleranceNodeView,
  grating: GratingNodeView,
  rcwa: RcwaNodeView,
  drawgrating: DrawGratingNodeView,
  rcwafield: RcwaFieldNodeView,
  extract: ExtractNodeView,
  merge: MergeNodeView,
  custom: CustomNodeView,
};
// every node inside the common frame (title bar, label, collapse, error mark); group frames draw themselves
const nodeTypes: NodeTypes = {
  ...(Object.fromEntries(Object.entries(baseNodeTypes).map(([k, V]) => [k, withShell(V as never)])) as NodeTypes),
  frame: FrameNodeView,
};

const edgeTypes = { flow: FlowEdge };
const ERROR_RED = '#e5484d';
// Shift, Ctrl or Cmd + click adds a node to the selection (Shift + drag on the canvas: box selection)
const MULTI_KEYS = ['Shift', 'Control', 'Meta'];
const DELETE_KEYS = ['Delete', 'Backspace'];

type Template = { type: AppNode['type']; label: string; data: AppNode['data'] };

const GROUPS: { name: keyof typeof GROUP_COLORS; items: Template[] }[] = [
  {
    name: 'Structure',
    items: [
      { type: 'material', label: 'Material', data: materialData('SiO2') },
      { type: 'matsweep', label: 'Material sweep', data: { name: '' } },
      { type: 'aniso', label: 'Anisotropic material', data: ANISO_DEFAULTS },
      { type: 'layer', label: 'Layer', data: { label: '', thickness: 100, layers2D: 1 } },
      { type: 'grating', label: 'Grating layer', data: GRATING_DEFAULTS },
      { type: 'rough', label: 'Roughness', data: ROUGH_DEFAULTS },
      { type: 'combine', label: 'Combine stack', data: { name: '', count: 3 } },
      { type: 'reverse', label: 'Reverse stack', data: REVERSE_DEFAULTS },
      {
        type: 'dbr',
        label: 'DBR builder',
        data: {
          name: '',
          period: [
            { mode: 'qw', d: 60, label: '', layers2D: 1 },
            { mode: 'qw', d: 100, label: '', layers2D: 1 },
          ],
          periods: 8,
          closing: false,
          mirrorAfterCavity: true,
          lambda0: 650,
          cavities: [],
        },
      },
      { type: 'filter', label: 'Filter designer', data: FILTER_DEFAULTS },
    ],
  },
  {
    name: 'Simulation',
    items: [
      { type: 'param', label: 'Parameter θ / λ', data: { quantity: 'theta', mode: 'range', value: 60, min: 40, max: 85, step: 0.05 } },
      {
        type: 'sweep',
        label: 'Sweep',
        data: { name: '', kind: 'number', mode: 'range', min: 40, max: 60, step: 5, list: '40, 45, 50, 55, 60' },
      },
      { type: 'compute', label: 'Compute TMM', data: { name: '', polarization: 'p' } },
      { type: 'rcwa', label: 'Compute RCWA', data: RCWA_DEFAULTS },
    ],
  },
  {
    name: 'Analysis',
    items: [
      { type: 'extremum', label: 'Min / max', data: ANALYSIS_DEFAULTS.extremum },
      { type: 'fwhm', label: 'FWHM', data: ANALYSIS_DEFAULTS.fwhm },
      { type: 'sensitivity', label: 'Sensitivity', data: ANALYSIS_DEFAULTS.sensitivity },
      { type: 'fit', label: 'Fit', data: fitDefaults() },
      { type: 'field', label: 'Field profile', data: FIELD_DEFAULTS },
      { type: 'tolerance', label: 'Tolerance (Monte Carlo)', data: TOLERANCE_DEFAULTS },
      { type: 'rcwafield', label: 'RCWA field map', data: RCWAFIELD_DEFAULTS },
      { type: 'extract', label: 'Extract data', data: { name: '', fields: [], fixed: {} } },
      { type: 'merge', label: 'Merge data', data: { name: '', labels: {} } },
      { type: 'custom', label: 'Custom data', data: { name: '', rows: [{ name: '', expr: '' }], aliases: {} } },
    ],
  },
  {
    name: 'Optimize',
    items: [
      { type: 'variable', label: 'Design variable', data: VARIABLE_DEFAULTS },
      { type: 'objective', label: 'Objective', data: OBJECTIVE_DEFAULTS },
      { type: 'zones', label: 'Zones', data: ZONES_DEFAULTS },
      { type: 'formula', label: 'Custom objective', data: FORMULA_DEFAULTS },
      { type: 'import', label: 'Measured data (CSV)', data: IMPORT_DEFAULTS },
      { type: 'target', label: 'Target curve', data: TARGET_DEFAULTS },
      { type: 'match', label: 'Curve match', data: MATCH_DEFAULTS },
      { type: 'optimizer', label: 'Optimization Engine', data: OPTIMIZER_DEFAULTS },
    ],
  },
  {
    name: 'View',
    items: [
      { type: 'plot', label: 'Plot', data: PLOT_DEFAULTS },
      { type: 'compare', label: 'Compare plot', data: COMPARE_DEFAULTS },
      { type: 'draw', label: 'View Stack', data: DRAW_DEFAULTS },
      { type: 'drawgrating', label: 'View Grating', data: DRAWGRATING_DEFAULTS },
    ],
  },
  {
    name: 'Notes',
    items: [
      { type: 'info', label: 'Info', data: INFO_DEFAULTS },
      { type: 'notes', label: 'Combine notes', data: NOTES_DEFAULTS },
    ],
  },
];

// The example projects are a separate chunk, loaded after the first render.
type ExampleList = { group: string; name: string; desc: string; make: () => Project }[];
const loadExamples = () => import('./examples.ts').then((m) => m.EXAMPLES as ExampleList);
// The page starts with Welcome, or (Welcome turned off) an empty project; the project open when the page was left is the
// last session (Welcome: “Continue the last project”, Projects: “Last session”).
const lastSession = keepLastSession();
const EMPTY: Project = { app: 'spr-flow', version: 3, nodes: [], edges: [], materials: [] };
const initial: Project = EMPTY;

function Flow() {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const history = useHistory(nodes, edges, setNodes, setEdges);
  const [userMaterials, setUserMaterials] = useState<MaterialDef[]>(initial.materials);
  // the project's title: the example loaded, the file opened, or typed in the toolbar
  const [projectName, setProjectName] = useState(initial.name ?? '');
  const [examples, setExamples] = useState<ExampleList>([]);
  useEffect(() => {
    document.title = `${projectName || 'Untitled project'} — SPR Forge`;
  }, [projectName]);
  const [panel, setPanel] = useState<'library' | 'projects' | 'help' | null>(null);
  // the welcome window: at the first start ('start'), or opened from Help ('help')
  const [welcome, setWelcomeState] = useState<'start' | 'help' | null>(() => (welcomeSeen() ? null : 'start'));
  const setWelcome = (on: boolean) => setWelcomeState(on ? 'help' : null);
  const togglePanel = (p: 'library' | 'projects' | 'help') => setPanel((cur) => (cur === p ? null : p));
  const { screenToFlowPosition, fitBounds, getNodesBounds, getNodes, getNode, setViewport, deleteElements, updateNodeData } = useReactFlow<AppNode>();
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Find a node (Ctrl+F or the ⌕ button of the canvas controls)
  const [finding, setFinding] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFinding(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [prefs, setPrefs] = useState<CanvasPrefs>(loadPrefs);
  const setPref = (patch: Partial<CanvasPrefs>) => setPrefs((p) => savePrefs({ ...p, ...patch }));
  useEffect(() => applyTheme(theme), [theme]);
  const openFile = useRef<HTMLInputElement>(null);

  const library: LibraryState = useMemo(() => {
    const lib = makeLibrary(userMaterials);
    return { lib, list: [...lib.values()], setUser: setUserMaterials };
  }, [userMaterials]);
  const engine = useEngine(nodes, edges, library.lib);

  // Autosave (debounced) to the browser.
  useEffect(() => {
    const t = setTimeout(() => autosave(toProject(nodes, edges, userMaterials, projectName)), 500);
    return () => clearTimeout(t);
  }, [nodes, edges, userMaterials, projectName]);

  // A newly loaded project is shown at its natural size (zoom 1), its top-left corner in view — not fitted to the
  // window, which shrank the nodes' text. Fit view stays available as a button of the canvas controls.
  const [fitPending, setFitPending] = useState(true);
  const initialized = useNodesInitialized();
  // Fits directly to the node bounds (React Flow's queued fitView waits for the next node change).
  const fitAll = useCallback(() => {
    const ns = getNodes();
    if (ns.length) fitBounds(getNodesBounds(ns), { padding: 0.06 });
  }, [fitBounds, getNodesBounds, getNodes]);
  useEffect(() => {
    if (!initialized || !fitPending) return;
    const ns = getNodes();
    if (ns.length) {
      const b = getNodesBounds(ns);
      setViewport({ x: 40 - b.x, y: 40 - b.y, zoom: 1 });
    }
    setFitPending(false);
  }, [initialized, fitPending, getNodes, getNodesBounds, setViewport]);

  const load = (p: Project, name?: string) => {
    setProjectName(name ?? p.name ?? '');
    engine.control.reset();
    history.reset();
    setNodes(p.nodes);
    setEdges(p.edges);
    setUserMaterials(p.materials.filter((m) => !BUILTINS.some((b) => b.id === m.id)));
    if (p.nodes.length) setFitPending(true);
    else setViewport({ x: 0, y: 0, zoom: 1 });
  };

  // The page and the app container never stay scrolled (the toolbar must stay in view): a scroll that the browser makes
  // by itself — bringing a focused element into view, keyboard scrolling — is undone.
  useEffect(() => {
    const app = document.querySelector<HTMLElement>('.app');
    const back = () => {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      if (app && (app.scrollTop || app.scrollLeft)) app.scrollTo(0, 0);
    };
    window.addEventListener('scroll', back, { passive: true });
    app?.addEventListener('scroll', back, { passive: true });
    return () => {
      window.removeEventListener('scroll', back);
      app?.removeEventListener('scroll', back);
    };
  }, []);

  // Start: the example list (a separate chunk); a shared link (#p=…) opens that project (without Welcome).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // (StrictMode runs effects twice in development)
    started.current = true;
    const shared = location.hash.startsWith('#p=') ? location.hash.slice(3) : '';
    if (shared) window.history.replaceState(null, '', location.pathname + location.search);
    loadExamples().then(setExamples);
    if (shared)
      decodeProject(shared).then((p) => {
        if (typeof p === 'string') alert(p);
        else {
          setWelcomeState(null);
          load(p, p.name ?? 'Shared project');
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const continueLast = lastSession ? () => load(lastSession.project, lastSession.project.name) : undefined;


  // Empty project: no nodes, no connections, no custom materials.
  const newProject = () => {
    const text = 'Start a new, empty project?\n\nAll nodes, connections and your custom materials will be removed. Use Save first to keep the current project.';
    if (confirm(text)) load(EMPTY);
  };

  const isValidConnection: IsValidConnection = useCallback(
    (c) => canConnect(getNode(c.source), getNode(c.target), c.targetHandle, c.sourceHandle),
    [getNode],
  );

  // Single-input handles keep only the newest connection.
  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) => {
        const multi = isMultiInput(getNode(c.target), c.targetHandle);
        const kept = eds.filter(
          (e) =>
            !(e.target === c.target && e.targetHandle === c.targetHandle && (!multi || e.source === c.source)),
        );
        return addEdge(c, kept);
      }),
    [setEdges, getNode],
  );

  // Colour each edge by the type of value it carries.
  const colorKey = nodes.map((n) => `${n.id}:${sourcePort(n)}`).join('|');
  // The nodes of this render (not getNode: right after loading a project the React Flow store does not hold the new
  // nodes yet, and the edges would stay unstyled until the next change). Rebuilt only when an output type changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [colorKey]);
  // the connections of the node under the mouse stand out (thicker)
  const [hovered, setHovered] = useState<string | null>(null);
  const styledEdges = useMemo(
    () =>
      edges.map((e) => {
        const s = nodeById.get(e.source);
        const p = s && sourcePort(s, e.sourceHandle);
        const color = (p && PORT_COLORS[p]) || 'var(--muted)';
        // custom line: curved or orthogonal, arrow at the middle (direction of the data); a selected line is thicker
        // and drawn over a halo (FlowEdge)
        const lit = hovered !== null && (e.source === hovered || e.target === hovered);
        return { ...e, type: 'flow', className: lit ? 'edge-lit' : undefined, style: { stroke: color, strokeWidth: e.selected || lit ? 4.5 : 3 }, data: { arrow: prefs.arrows, shape: prefs.shape } };
      }),
    [edges, nodeById, prefs.arrows, prefs.shape, hovered],
  );

  // Deleting a frame keeps its nodes (they leave the frame) unless “remove the group and its nodes” was chosen.
  const deleteChildren = useRef(false);
  const onBeforeDelete = useCallback(
    async ({ nodes: del, edges: delEdges }: { nodes: AppNode[]; edges: Edge[] }) => {
      const frames = new Set(del.filter((n) => n.type === 'frame').map((n) => n.id));
      const withChildren = deleteChildren.current;
      deleteChildren.current = false;
      if (!frames.size || withChildren) return { nodes: del, edges: delEdges };
      const kept = new Set(del.filter((n) => n.parentId && frames.has(n.parentId) && !n.selected).map((n) => n.id));
      if (!kept.size) return { nodes: del, edges: delEdges };
      setNodes((ns) => releaseChildren(ns, frames, (n) => kept.has(n.id)));
      const gone = new Set(del.filter((n) => !kept.has(n.id)).map((n) => n.id));
      return { nodes: del.filter((n) => gone.has(n.id)), edges: delEdges.filter((e) => e.selected || gone.has(e.source) || gone.has(e.target)) };
    },
    [setNodes],
  );

  const setCollapsed = (ids: string[], collapsed: boolean) =>
    setNodes((ns) => ns.map((n) => (ids.includes(n.id) && n.type !== 'frame' ? ({ ...n, data: { ...n.data, collapsed: collapsed || undefined } } as AppNode) : n)));
  const groupSelection = (ids: string[]) => {
    const r = groupNodes(getNodes(), ids, 'Group', FRAME_COLORS[0]);
    if (!r.frameId) return;
    setNodes(r.nodes);
    editCaption(r.frameId); // name it right away
  };
  const nodeMenu = (): { title: string; actions: MenuAction[] } | null => {
    if (!menu || menu.kind === 'pane') return null;
    const ids = menu.kind === 'node' ? [menu.nodeId] : menu.ids;
    const remove: MenuAction = { label: ids.length > 1 ? 'Remove selected nodes' : 'Remove node', danger: true, kbd: 'Del', onClick: () => deleteElements({ nodes: ids.map((id) => ({ id })) }) };
    const inGroup = ids.some((id) => getNode(id)?.parentId);
    const leave: MenuAction[] = inGroup ? [{ label: 'Remove from group', onClick: () => setNodes((ns) => removeFromGroup(ns, ids)) }] : [];
    if (menu.kind === 'selection')
      return {
        title: `${ids.length} nodes selected`,
        actions: [
          { label: 'Group…', onClick: () => groupSelection(ids) },
          { label: 'Collapse', onClick: () => setCollapsed(ids, true) },
          { label: 'Expand', onClick: () => setCollapsed(ids, false) },
          ...leave,
          remove,
        ],
      };
    const n = getNode(menu.nodeId);
    if (!n) return null;
    if (n.type === 'frame')
      return {
        title: `Group “${n.data.name}”`,
        actions: [
          { label: 'Rename', onClick: () => editCaption(n.id) },
          { colors: FRAME_COLORS, current: n.data.color, onPick: (color) => updateNodeData(n.id, { color }) },
          { label: 'Ungroup (keep the nodes)', onClick: () => setNodes((ns) => ungroup(ns, n.id)) },
          {
            label: 'Remove the group and its nodes',
            danger: true,
            onClick: () => {
              deleteChildren.current = true;
              deleteElements({ nodes: [{ id: n.id }] });
            },
          },
        ],
      };
    return {
      title: nodeTitle(n),
      actions: [
        { label: n.data.caption ? 'Edit label' : 'Add label', onClick: () => editCaption(n.id) },
        { label: n.data.collapsed ? 'Expand' : 'Collapse', onClick: () => setCollapsed([n.id], !n.data.collapsed) },
        {
          label: 'Duplicate',
          onClick: () => {
            const id = `${n.type}-${crypto.randomUUID().slice(0, 8)}`;
            setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), { ...n, id, selected: true, position: { x: n.position.x + 40, y: n.position.y + 40 }, data: structuredClone(n.data) } as AppNode]);
          },
        },
        { label: 'Disconnect all', onClick: () => setEdges((es) => es.filter((e) => e.source !== n.id && e.target !== n.id)) },
        ...leave,
        remove,
      ],
    };
  };
  const nm = nodeMenu();
  // minimap: section colours, nodes with errors in red, frames as light boxes
  const miniColor = (n: Node) => {
    const a = n as AppNode;
    if (a.type === 'frame') return `${nodeColor(a)}30`;
    return engine.results.get(a.id)?.errors.length ? ERROR_RED : nodeColor(a);
  };
  const miniStroke = (n: Node) => (engine.results.get(n.id)?.errors.length ? ERROR_RED : nodeColor(n as AppNode));

  const menuItems: MenuItem[] = useMemo(() => GROUPS.flatMap((g) => g.items.map((i) => ({ type: i.type, label: i.label, group: g.name }))), []);
  const closeMenu = useCallback(() => setMenu(null), []);

  // the nodes panel (left): the sections of GROUPS with the colours of their nodes
  const paletteGroups: PaletteGroup[] = useMemo(
    () => GROUPS.map((g) => ({ name: g.name, color: GROUP_COLORS[g.name], items: g.items.map((t) => ({ type: t.type, label: t.label, help: NODE_HELP[t.type], color: NODE_COLORS[t.type] })) })),
    [],
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const template = (type: AppNode['type']) => GROUPS.flatMap((g) => g.items).find((i) => i.type === type);
  // a node dragged from the panel: dropped where the mouse is
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDrop = (e: DragEvent) => {
    const t = template(e.dataTransfer.getData(DRAG_TYPE) as AppNode['type']);
    if (!t) return;
    e.preventDefault();
    addNode(t, { x: e.clientX, y: e.clientY });
  };

  const addNode = (t: Template, at?: { x: number; y: number }) => {
    const r = canvasRef.current?.getBoundingClientRect();
    let position = screenToFlowPosition(at ?? (r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 }));
    // nodes added one after another by a click: shifted so they do not cover each other
    if (!at) {
      const taken = (q: { x: number; y: number }) => getNodes().some((n) => Math.abs(n.position.x - q.x) < 24 && Math.abs(n.position.y - q.y) < 24);
      for (let k = 0; k < 40 && taken(position); k++) position = { x: position.x + 36, y: position.y + 36 };
    }
    if (prefs.snap) position = { x: Math.round(position.x / prefs.step) * prefs.step, y: Math.round(position.y / prefs.step) * prefs.step };
    const id = `${t.type}-${crypto.randomUUID().slice(0, 8)}`;
    const data = t.type === 'fit' ? fitDefaults() : structuredClone(t.data);
    // the new node on top (last and selected); the others deselected
    setNodes((ns) => [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), { id, type: t.type, position, data, selected: true } as AppNode]);
  };

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand" title="SPR Forge">
          <Logo />
          <strong className="brand-text">SPR Forge</strong>
        </span>
        <input
          className="project-name"
          value={projectName}
          placeholder="Untitled project"
          title={`The current project (the example loaded, the file opened, or a name of your own)${history.canUndo ? ' · modified since it was loaded' : ''}`}
          onChange={(e) => setProjectName(e.target.value)}
        />
        {history.canUndo && <span className="muted" title="Modified since it was loaded">•</span>}
        <button onClick={newProject} title="Remove everything and start an empty project">New</button>
        <select
          className="examples-menu"
          value=""
          title="Open a complete example"
          onChange={(e) => {
            const ex = examples[Number(e.target.value)];
            if (ex && confirm(`Replace the current project with the “${ex.name}” example?`)) load(ex.make(), ex.name);
          }}
        >
          <option value="">Examples…</option>
          {/* grouped by subject, each group titled */}
          {[...new Set(examples.map((ex) => ex.group))].map((g) => (
            <optgroup key={g} label={g}>
              {examples.map((ex, i) =>
                ex.group === g ? (
                  <option key={ex.name} value={i}>
                    {ex.name}
                  </option>
                ) : null,
              )}
            </optgroup>
          ))}
        </select>
        <button onClick={() => openFile.current?.click()}>Open…</button>
        <button
          onClick={() =>
            download(stringifyProject(toProject(nodes, edges, userMaterials, projectName), 1), `${(projectName || 'spr-forge-project').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')}.json`, 'application/json')
          }
        >
          Save
        </button>
        <button className={panel === 'projects' ? 'active' : ''} onClick={() => togglePanel('projects')} title="Several projects kept in this browser">
          Projects…
        </button>
        <button className={panel === 'library' ? 'active' : ''} onClick={() => togglePanel('library')} title="Material library (built-in and your own materials)">
          Materials
        </button>
        <span className="undo-redo">
          <button onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
          <button onClick={history.redo} disabled={!history.canRedo} title="Redo (Ctrl+Y / Ctrl+Shift+Z)" aria-label="Redo">↷</button>
        </span>
        <button className={panel === 'help' ? 'active' : ''} onClick={() => togglePanel('help')} title="Getting started, the nodes, shortcuts, validation">
          Help
        </button>
        <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)} title="Colour theme">
          <option value="system">Theme: system</option>
          <option value="light">Theme: light</option>
          <option value="dark">Theme: dark</option>
        </select>
        <input
          ref={openFile}
          type="file"
          accept=".json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const p = parseProject(await f.text());
            if (typeof p === 'string') alert(p);
            else load(p, p.name ?? f.name.replace(/\.json$/i, ''));
          }}
        />
      </header>
      <div className="workspace">
      <NodePalette groups={paletteGroups} onAdd={(type) => { const t = template(type); if (t) addNode(t); }} />
      <LibraryContext.Provider value={library}>
        <EngineContext.Provider value={engine}>
          <div className="canvas" ref={canvasRef} onDragOver={onDragOver} onDrop={onDrop}>
            <ReactFlow
              nodes={nodes}
              edges={styledEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={{ animated: true }}
              minZoom={0.1}
              zoomOnDoubleClick={false}
              multiSelectionKeyCode={MULTI_KEYS}
              deleteKeyCode={DELETE_KEYS}
              colorMode={theme}
              edgeTypes={edgeTypes}
              connectionLineType={prefs.shape === 'orthogonal' ? ConnectionLineType.SmoothStep : ConnectionLineType.Bezier}
              snapToGrid={prefs.snap}
              snapGrid={[prefs.step, prefs.step]}
              onPaneClick={closeMenu}
              onMoveStart={closeMenu}
              onNodeDragStart={closeMenu}
              onPaneContextMenu={(e) => {
                e.preventDefault();
                setMenu({ kind: 'pane', x: e.clientX, y: e.clientY });
              }}
              onBeforeDelete={onBeforeDelete}
              onNodeMouseEnter={(_, n) => setHovered(n.type === 'frame' ? null : n.id)}
              onNodeMouseLeave={() => setHovered(null)}
              onNodeContextMenu={(e, n) => {
                e.preventDefault();
                // right-click on one of several selected nodes: the menu of the selection
                const sel = getNodes().filter((x) => x.selected);
                if (n.selected && sel.length > 1) setMenu({ kind: 'selection', x: e.clientX, y: e.clientY, ids: sel.map((x) => x.id) });
                else setMenu({ kind: 'node', x: e.clientX, y: e.clientY, nodeId: n.id, label: nodeTitle(n) });
              }}
              onSelectionContextMenu={(e, ns) => {
                e.preventDefault();
                setMenu({ kind: 'selection', x: e.clientX, y: e.clientY, ids: ns.map((n) => n.id) });
              }}
            >
              <Background gap={prefs.snap ? prefs.step : 20} />
              <Controls showFitView={false}>
                <ControlButton onClick={fitAll} title="Fit view" aria-label="Fit view">
                  ⤢
                </ControlButton>
                <ControlButton
                  className={prefs.snap ? 'on' : ''}
                  onClick={() => setPref({ snap: !prefs.snap })}
                  title={prefs.snap ? `Snap to grid: on (${prefs.step} px) — click to move freely` : 'Snap to grid: off — click to position on a grid'}
                  aria-label="Snap to grid"
                >
                  #
                </ControlButton>
                {prefs.snap && (
                  <ControlButton onClick={() => setPref({ step: STEPS[(STEPS.indexOf(prefs.step) + 1) % STEPS.length] })} title="Grid step (click to change)" aria-label="Grid step">
                    <span className="step">{prefs.step}</span>
                  </ControlButton>
                )}
                <ControlButton
                  className={prefs.shape === 'orthogonal' ? 'on' : ''}
                  onClick={() => setPref({ shape: prefs.shape === 'orthogonal' ? 'curved' : 'orthogonal' })}
                  title={prefs.shape === 'orthogonal' ? 'Connections: right angles — click for curves' : 'Connections: curves — click for right angles'}
                  aria-label="Connection shape"
                >
                  {prefs.shape === 'orthogonal' ? '┐' : '∿'}
                </ControlButton>
                <ControlButton className={prefs.arrows ? 'on' : ''} onClick={() => setPref({ arrows: !prefs.arrows })} title={prefs.arrows ? 'Arrows on the connections (direction of the data): on' : 'Arrows on the connections (direction of the data): off'} aria-label="Arrows">
                  →
                </ControlButton>
                <ControlButton onClick={() => setFinding(true)} title="Find a node (Ctrl+F)" aria-label="Find a node">
                  ⌕
                </ControlButton>
                <ControlButton className={prefs.minimap ? 'on' : ''} onClick={() => setPref({ minimap: !prefs.minimap })} title={prefs.minimap ? 'Minimap: on — click to hide it' : 'Minimap: off — click to show it'} aria-label="Minimap">
                  ▣
                </ControlButton>
              </Controls>
              {prefs.minimap && <MiniMap pannable zoomable nodeColor={miniColor} nodeStrokeColor={miniStroke} nodeBorderRadius={3} />}
            </ReactFlow>
            <Suspense fallback={null}>
              {panel === 'library' && <LibraryPanel onClose={() => setPanel(null)} />}
              {panel === 'projects' && (
                <ProjectsPanel
                  onClose={() => setPanel(null)}
                  current={() => toProject(nodes, edges, userMaterials, projectName)}
                  name={projectName}
                  last={lastSession}
                  onOpen={(p, name) => {
                    load(p, name);
                    setPanel(null);
                  }}
                />
              )}
              {panel === 'help' && <HelpPanel onClose={() => setPanel(null)} examples={examples} onWelcome={() => setWelcome(true)} />}
            </Suspense>
            {finding && <FindNode onClose={() => setFinding(false)} />}
            {welcome && (
              <Welcome
                onClose={() => setWelcomeState(null)}
                examples={examples}
                // at start the page holds an empty project (nothing to confirm); from Help it replaces the current one
                onExample={(i) => {
                  const ex = examples[i];
                  if (ex && (welcome === 'start' || !nodes.length || confirm(`Replace the current project with the “${ex.name}” example?`))) load(ex.make(), ex.name);
                }}
                onEmpty={() => (welcome === 'start' ? load(EMPTY) : newProject())}
                onHelp={() => setPanel('help')}
                last={
                  lastSession && continueLast
                    ? { name: lastSession.project.name ?? '', saved: lastSession.saved, open: () => (welcome === 'start' || confirm('Open the last project? It replaces the current one.')) && continueLast() }
                    : undefined
                }
              />
            )}
            {menu && (
              <ContextMenu
                menu={menu}
                items={menuItems}
                onClose={closeMenu}
                onAdd={(type) => {
                  const t = GROUPS.flatMap((g) => g.items).find((i) => i.type === type);
                  if (t) addNode(t, { x: menu.x, y: menu.y });
                }}
                title={nm?.title}
                actions={nm?.actions}
              />
            )}
          </div>
        </EngineContext.Provider>
      </LibraryContext.Provider>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
