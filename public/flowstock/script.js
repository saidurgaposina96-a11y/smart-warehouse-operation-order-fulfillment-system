/* FlowStock AI — Warehouse Control Center (vanilla JS, mock data only) */
(() => {
  "use strict";

  /* ---------------- Mock data ---------------- */
  const AISLES = ["A", "B", "C", "D", "E", "F"];
  const PRODUCT_SEED = [
    ["SKU-1001", "Thermal Label Roll 4x6", "Consumables", "A-01", 480, 120, 150],
    ["SKU-1002", "Cordless Barcode Scanner", "Devices", "A-04", 42, 18, 20],
    ["SKU-1003", "Industrial Pallet Wrap", "Packaging", "B-02", 210, 60, 80],
    ["SKU-1004", "Lithium Forklift Battery", "Equipment", "F-01", 9, 6, 5],
    ["SKU-1005", "Corrugated Box 30x30", "Packaging", "B-05", 1350, 400, 500],
    ["SKU-1006", "Smart Shelf Sensor", "Devices", "C-03", 74, 40, 30],
    ["SKU-1007", "Safety Boots (EU42)", "Apparel", "D-02", 128, 35, 40],
    ["SKU-1008", "Hi-Vis Jacket XL", "Apparel", "D-04", 66, 22, 30],
    ["SKU-1009", "Hydraulic Pallet Jack", "Equipment", "F-03", 14, 9, 6],
    ["SKU-1010", "RFID Gate Antenna", "Devices", "C-06", 22, 14, 10],
    ["SKU-1011", "Stretch Film Dispenser", "Packaging", "B-08", 95, 30, 35],
    ["SKU-1012", "Cold Chain Gel Pack", "Consumables", "E-01", 640, 260, 300],
    ["SKU-1013", "Insulated Shipper 20L", "Packaging", "E-04", 180, 95, 90],
    ["SKU-1014", "Handheld Terminal HT-9", "Devices", "A-07", 31, 21, 15],
    ["SKU-1015", "Conveyor Drive Belt", "Equipment", "F-06", 18, 4, 8],
    ["SKU-1016", "Anti-Static Bubble Wrap", "Packaging", "B-11", 340, 90, 120],
    ["SKU-1017", "Warehouse Drone Rotor Kit", "Equipment", "F-08", 26, 16, 12],
    ["SKU-1018", "Temperature Logger", "Devices", "E-07", 58, 24, 25],
  ];

  const CUSTOMERS = ["NordFresh Retail", "Ayra Pharma", "Volt Logistics", "BluePeak Grocers", "Helix MedTech",
    "Orbit Electronics", "GreenLeaf Foods", "Summit Industrial", "CityMart Express", "Zenith Cold Chain",
    "Vertex Robotics", "Kiro Fashion", "Northwind Depot", "Solace Clinics", "Pulse Auto Parts", "Metro Build Co"];

  const PRIORITY = {
    Critical: { weight: 100, cls: "b-red", sla: 2 },
    High: { weight: 60, cls: "b-purple", sla: 6 },
    Medium: { weight: 30, cls: "b-yellow", sla: 24 },
    Low: { weight: 10, cls: "b-sky", sla: 48 },
  };

  const STATUS_CLS = {
    New: "b-grey", Allocated: "b-sky", Backordered: "b-red", Picking: "b-yellow",
    Packing: "b-purple", "Quality Check": "b-yellow", Dispatched: "b-green", Blocked: "b-red",
  };

  /* ---------------- State ---------------- */
  let S = {};
  const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
  const now = () => new Date();
  const timeStr = (d = now()) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  function seed() {
    const products = PRODUCT_SEED.map(([sku, name, category, location, stock, reserved, reorder]) => ({
      sku, name, category, location, stock, reserved: 0, reorder, damaged: 0,
      inbound: Math.random() > 0.6 ? Math.round(reorder * (0.5 + Math.random())) : 0,
      _baseReserved: reserved,
    }));

    const orderTemplates = [
      ["Critical", 3], ["Critical", 2], ["High", 3], ["High", 2], ["High", 2],
      ["Medium", 3], ["Medium", 2], ["Medium", 2], ["Medium", 1], ["Low", 2],
      ["Low", 1], ["High", 1], ["Critical", 1], ["Medium", 2], ["Low", 3], ["Medium", 1],
    ];

    const orders = orderTemplates.map((t, i) => {
      const [priority, lines] = t;
      const items = [];
      const pool = [...products].sort(() => Math.random() - 0.5);
      for (let l = 0; l < lines; l++) {
        const p = pool[l];
        const qty = Math.max(2, Math.round((p.stock / 12) * (0.3 + Math.random())) || 3);
        items.push({ sku: p.sku, qty: Math.min(qty, 40), allocated: 0, backordered: 0, picked: 0 });
      }
      const ageMin = Math.round(Math.random() * 300);
      return {
        id: "ORD-" + (2401 + i),
        customer: CUSTOMERS[i % CUSTOMERS.length],
        priority,
        items,
        status: "New",
        value: 0,
        createdAt: new Date(Date.now() - ageMin * 60000),
        ageMin,
        log: [{ t: timeStr(), text: "Order received via EDI channel." }],
        decisionIds: [],
      };
    });
    orders.forEach(o => { o.value = o.items.reduce((s, it) => s + it.qty * (35 + (it.sku.charCodeAt(6) % 9) * 21), 0); });

    S = {
      products, orders,
      exceptions: [], decisions: [], events: [],
      metrics: { dispatched: 0, cycleTimes: [], allocations: 0, backorders: 0 },
      pickRoute: [],
    };
    // pre-reserve some stock to look realistic
    products.forEach(p => { p.reserved = Math.min(p._baseReserved, Math.max(0, p.stock - 1)); });
    log("System", "Demo dataset initialised: " + products.length + " SKUs, " + orders.length + " orders.");
  }

  /* ---------------- Helpers ---------------- */
  const P = (sku) => S.products.find(p => p.sku === sku);
  const available = (p) => Math.max(0, p.stock - p.reserved - p.damaged);
  const stockStatus = (p) => {
    const a = available(p);
    if (p.stock - p.damaged <= 0) return { label: "Out of Stock", cls: "b-red" };
    if (a <= 0) return { label: "Fully Reserved", cls: "b-purple" };
    if (a < p.reorder * 0.5) return { label: "Critical Low", cls: "b-red" };
    if (a < p.reorder) return { label: "Low Stock", cls: "b-yellow" };
    return { label: "Healthy", cls: "b-green" };
  };
  const orderQty = (o) => o.items.reduce((s, i) => s + i.qty, 0);
  const orderAllocated = (o) => o.items.reduce((s, i) => s + i.allocated, 0);
  const orderBackordered = (o) => o.items.reduce((s, i) => s + i.backordered, 0);
  const atRisk = (o) => (o.priority === "Critical" || o.priority === "High") &&
    (orderBackordered(o) > 0 || o.status === "Blocked" || (o.ageMin > PRIORITY[o.priority].sla * 60 && o.status !== "Dispatched"));
  const fmt = (n) => n.toLocaleString();
  const money = (n) => "$" + n.toLocaleString();

  function log(actor, text) {
    S.events.unshift({ t: timeStr(), actor, text });
    S.events = S.events.slice(0, 60);
  }

  function toast(title, msg, type = "info") {
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.innerHTML = `<b>${title}</b>${msg}`;
    document.getElementById("toasts").appendChild(el);
    setTimeout(() => { el.style.transition = ".4s"; el.style.opacity = "0"; el.style.transform = "translateX(40px)"; }, 4200);
    setTimeout(() => el.remove(), 4800);
  }

  function addDecision(d) {
    const dec = Object.assign({
      id: uid("DEC"), t: timeStr(), status: "Recommended", impact: "Medium",
    }, d);
    S.decisions.unshift(dec);
    return dec;
  }

  function addException(e) {
    const exc = Object.assign({ id: uid("EXC"), t: timeStr(), status: "Open", decisionId: null }, e);
    S.exceptions.unshift(exc);
    log("Exception", exc.type + " — " + exc.title);
    return exc;
  }

  /* ---------------- Allocation engine ---------------- */
  function priorityScore(o) {
    const base = PRIORITY[o.priority].weight;
    const slaMin = PRIORITY[o.priority].sla * 60;
    const urgency = Math.min(50, (o.ageMin / slaMin) * 50);
    const valueBoost = Math.min(20, o.value / 2500);
    return Math.round(base + urgency + valueBoost);
  }

  function runAllocation(silent) {
    const queue = S.orders
      .filter(o => ["New", "Allocated", "Backordered"].includes(o.status))
      .sort((a, b) => priorityScore(b) - priorityScore(a));

    let allocatedOrders = 0, partial = 0, decisions = 0;

    queue.forEach(o => {
      let changed = false, shortLines = [];
      o.items.forEach(it => {
        const need = it.qty - it.allocated - it.backordered;
        if (need <= 0) return;
        const p = P(it.sku);
        const canGive = Math.min(need, available(p));
        if (canGive > 0) {
          it.allocated += canGive;
          p.reserved += canGive;
          S.metrics.allocations += canGive;
          changed = true;
        }
        const short = need - canGive;
        if (short > 0) {
          it.backordered += short;
          S.metrics.backorders += short;
          shortLines.push({ sku: it.sku, need, gave: canGive, short });
          changed = true;
        }
      });

      if (!changed) return;
      const back = orderBackordered(o);
      o.status = back > 0 ? "Backordered" : "Allocated";
      if (back > 0) partial++; else allocatedOrders++;

      if (shortLines.length) {
        shortLines.forEach(sl => {
          const p = P(sl.sku);
          const competitor = S.orders.find(x => x !== o && x.items.some(i => i.sku === sl.sku && i.allocated > 0) && PRIORITY[x.priority].weight < PRIORITY[o.priority].weight);
          const dec = addDecision({
            title: `Partial allocation for ${o.id} — ${p.name}`,
            orderId: o.id, sku: sl.sku,
            impact: o.priority === "Critical" ? "High" : "Medium",
            options: [
              { label: `Allocate ${sl.gave} now + backorder ${sl.short}`, chosen: true },
              { label: `Hold entire line until full stock arrives`, chosen: false },
              { label: competitor ? `Reallocate stock from ${competitor.id} (${competitor.priority})` : "Emergency purchase order", chosen: false },
            ],
            why: `${o.id} is ${o.priority} priority (score ${priorityScore(o)}) and needs ${sl.need} units of ${sl.sku}, but only ${sl.gave} are available (${p.stock} on hand − ${p.reserved} reserved − ${p.damaged} damaged). Shipping ${sl.gave} immediately protects the ${PRIORITY[o.priority].sla}h SLA on ${Math.round(sl.gave / sl.need * 100)}% of the line, while ${sl.short} units are backordered against the ${p.inbound || "next"} inbound receipt. Holding the whole line would breach SLA for zero benefit; reallocating from a lower-priority order was rejected because it would only shift the shortage downstream.`,
            action: sl.short > 0 && p.inbound === 0 ? "Raise emergency replenishment PO" : "Backorder against inbound receipt",
          });
          decisions++;
          o.decisionIds.push(dec.id);
          addException({
            type: "Stock Shortage", severity: o.priority === "Critical" ? "Critical" : "High",
            title: `${sl.short} units short of ${p.name} for ${o.id}`,
            detail: `Requested ${sl.need}, allocated ${sl.gave}, backordered ${sl.short}.`,
            orderId: o.id, sku: sl.sku, decisionId: dec.id,
          });
        });
        o.log.push({ t: timeStr(), text: `Partially allocated — ${orderAllocated(o)}/${orderQty(o)} units. ${back} backordered.` });
      } else {
        o.log.push({ t: timeStr(), text: `Fully allocated ${orderAllocated(o)}/${orderQty(o)} units by priority engine (score ${priorityScore(o)}).` });
      }
    });

    // Low-stock replenishment recommendations
    S.products.forEach(p => {
      if (available(p) < p.reorder && !S.decisions.some(d => d.sku === p.sku && d.kind === "replenish" && d.status !== "Rejected")) {
        addDecision({
          kind: "replenish", sku: p.sku, impact: available(p) < p.reorder * 0.4 ? "High" : "Low",
          title: `Replenish ${p.name} (${p.sku})`,
          options: [
            { label: `Raise PO for ${Math.max(p.reorder * 2 - available(p), p.reorder)} units`, chosen: true },
            { label: "Wait for weekly cycle order", chosen: false },
          ],
          why: `Available stock is ${available(p)} against a reorder point of ${p.reorder}. At the current outbound rate this SKU depletes before the standard weekly cycle order arrives, so an early PO avoids future backorders on ${S.orders.filter(o => o.items.some(i => i.sku === p.sku)).length} open orders.`,
          action: "Create purchase order",
        });
      }
    });

    log("Engine", `Allocation pass complete — ${allocatedOrders} fully allocated, ${partial} partial, ${decisions} decisions generated.`);
    if (!silent) toast("Allocation engine", `${allocatedOrders} orders fully allocated, ${partial} partial, ${decisions} new decisions.`, partial ? "warn" : "ok");
    render();
  }

  /* ---------------- Workflow actions ---------------- */
  function buildRoute(o) {
    const locs = o.items.map(i => P(i.sku).location);
    return [...new Set(locs)].sort();
  }

  function startPicking(id) {
    const o = S.orders.find(x => x.id === id);
    o.status = "Picking";
    o.route = buildRoute(o);
    o.items.forEach(i => i.picked = 0);
    S.pickRoute = o.route;
    o.log.push({ t: timeStr(), text: `Pick task released. Optimised route: ${o.route.join(" → ")}.` });
    log("Picking", `${o.id} released to picking (${o.route.length} stops).`);
    toast("Picking started", `${o.id} — route ${o.route.join(" → ")}`, "info");
    render();
  }

  function completePick(id) {
    const o = S.orders.find(x => x.id === id);
    o.items.forEach(i => {
      i.picked = i.allocated;
      const p = P(i.sku);
      p.stock -= i.allocated;
      p.reserved = Math.max(0, p.reserved - i.allocated);
    });
    o.status = "Packing";
    o.log.push({ t: timeStr(), text: `Picked ${o.items.reduce((s, i) => s + i.picked, 0)} units. Moved to packing station.` });
    log("Picking", `${o.id} picked and staged for packing.`);
    toast("Pick complete", `${o.id} staged at packing station.`, "ok");
    render();
  }

  function packOrder(id) {
    const o = S.orders.find(x => x.id === id);
    o.status = "Quality Check";
    o.cartons = Math.max(1, Math.ceil(o.items.reduce((s, i) => s + i.picked, 0) / 12));
    o.log.push({ t: timeStr(), text: `Packed into ${o.cartons} carton(s). Awaiting quality check.` });
    log("Packing", `${o.id} packed (${o.cartons} cartons).`);
    toast("Packed", `${o.id} → ${o.cartons} carton(s), awaiting QC.`, "info");
    render();
  }

  function qcPass(id) {
    const o = S.orders.find(x => x.id === id);
    o.log.push({ t: timeStr(), text: "Quality check passed — seals, labels and counts verified." });
    dispatch(id);
  }

  function qcFail(id, kind) {
    const o = S.orders.find(x => x.id === id);
    const it = o.items[0];
    const p = P(it.sku);
    const qty = Math.max(1, Math.round(it.picked * 0.25)) || 1;
    o.status = "Blocked";
    p.damaged += qty;
    const dec = addDecision({
      title: `${kind} unit recovery for ${o.id}`,
      orderId: o.id, sku: p.sku, impact: "High",
      options: [
        { label: `Swap ${qty} unit(s) from available stock at ${p.location}`, chosen: available(p) >= qty },
        { label: `Ship short and backorder ${qty} unit(s)`, chosen: available(p) < qty },
        { label: "Hold complete shipment", chosen: false },
      ],
      why: available(p) >= qty
        ? `QC flagged ${qty} ${kind.toLowerCase()} unit(s) of ${p.name}. ${available(p)} good units remain available at ${p.location}, so an immediate swap restores a complete shipment without breaching the ${PRIORITY[o.priority].sla}h SLA. Damaged stock is quarantined and written off inventory.`
        : `QC flagged ${qty} ${kind.toLowerCase()} unit(s) of ${p.name} and no replacement stock is available. Shipping the remaining ${it.picked - qty} units keeps ${Math.round((it.picked - qty) / it.picked * 100)}% of the order on time; the shortfall is backordered rather than holding the whole shipment.`,
      action: available(p) >= qty ? "Swap from available stock" : "Ship short + backorder",
    });
    const exc = addException({
      type: kind, severity: "Critical",
      title: `${qty} ${kind.toLowerCase()} unit(s) of ${p.name} on ${o.id}`,
      detail: `Detected at quality check station QC-2. Order blocked pending resolution.`,
      orderId: o.id, sku: p.sku, decisionId: dec.id,
    });
    o.log.push({ t: timeStr(), text: `QC FAILED — ${qty} ${kind.toLowerCase()} unit(s). Exception ${exc.id} raised.` });
    toast("Quality exception", `${o.id}: ${qty} ${kind.toLowerCase()} unit(s). Decision recommended.`, "err");
    render();
    return { exc, dec, qty };
  }

  function applyDecision(decId) {
    const d = S.decisions.find(x => x.id === decId);
    if (!d || d.status === "Applied") return;
    d.status = "Applied";
    const o = d.orderId && S.orders.find(x => x.id === d.orderId);
    const p = d.sku && P(d.sku);

    if (d.kind === "replenish" && p) {
      const qty = Math.max(p.reorder * 2 - available(p), p.reorder);
      p.inbound += qty;
      d.resolution = `PO raised for ${qty} units of ${p.sku}. Inbound ETA 36h.`;
      log("Procurement", `PO raised: ${qty} × ${p.sku}.`);
    } else if (o && p && d.action === "Swap from available stock") {
      const it = o.items.find(i => i.sku === p.sku);
      const qty = Math.max(1, Math.round(it.picked * 0.25));
      p.stock -= qty; p.damaged -= Math.min(p.damaged, qty);
      o.status = "Quality Check";
      d.resolution = `${qty} replacement unit(s) pulled from ${p.location}; damaged stock written off. Order re-entered QC.`;
      o.log.push({ t: timeStr(), text: d.resolution });
    } else if (o && d.action === "Ship short + backorder") {
      const it = o.items.find(i => i.sku === d.sku);
      const qty = Math.max(1, Math.round(it.picked * 0.25));
      it.picked = Math.max(0, it.picked - qty);
      it.backordered += qty;
      o.status = "Quality Check";
      d.resolution = `Shipment released short by ${qty} unit(s); backorder line created for follow-up shipment.`;
      o.log.push({ t: timeStr(), text: d.resolution });
    } else if (o) {
      d.resolution = d.action + " confirmed by supervisor.";
      o.log.push({ t: timeStr(), text: d.resolution });
    } else {
      d.resolution = d.action + " executed.";
    }

    const exc = S.exceptions.find(e => e.decisionId === d.id);
    if (exc) { exc.status = "Resolved"; exc.resolution = d.resolution; }
    log("Decision", `${d.title} → applied.`);
    toast("Decision applied", d.resolution, "ok");
    render();
  }

  function rejectDecision(decId) {
    const d = S.decisions.find(x => x.id === decId);
    if (!d) return;
    d.status = "Rejected";
    d.resolution = "Overridden by supervisor — manual handling.";
    log("Decision", `${d.title} → rejected.`);
    toast("Decision rejected", "Marked for manual handling.", "warn");
    render();
  }

  function dispatch(id) {
    const o = S.orders.find(x => x.id === id);
    o.status = "Dispatched";
    o.dispatchedAt = now();
    const cycle = Math.max(6, Math.round((Date.now() - o.createdAt.getTime()) / 60000 / 6));
    S.metrics.cycleTimes.push(cycle);
    S.metrics.dispatched++;
    o.log.push({ t: timeStr(), text: `Dispatched via dock D-${1 + (S.metrics.dispatched % 4)}. Carrier manifest generated.` });
    log("Dispatch", `${o.id} dispatched (${cycle} min cycle time).`);
    toast("Dispatched", `${o.id} left the building. Cycle time ${cycle} min.`, "ok");
    render();
  }

  /* ---------------- What-If simulator ---------------- */
  function simulate(sku, lossPct) {
    const p = P(sku);
    const lost = Math.round(p.stock * (lossPct / 100));
    const projected = Math.max(0, available(p) - lost);
    const affected = S.orders.filter(o => o.status !== "Dispatched" && o.items.some(i => i.sku === sku));
    const sorted = [...affected].sort((a, b) => priorityScore(b) - priorityScore(a));
    let pool = projected;
    const rows = sorted.map(o => {
      const need = o.items.filter(i => i.sku === sku).reduce((s, i) => s + (i.qty - i.picked), 0);
      const give = Math.min(need, pool);
      pool -= give;
      return { o, need, give, short: need - give };
    });
    const shorted = rows.filter(r => r.short > 0);
    return { p, lost, projected, rows, shorted };
  }

  /* ---------------- Warehouse crisis scenario ---------------- */
  let crisisRunning = false;
  function runCrisis() {
    if (crisisRunning) return;
    crisisRunning = true;
    const btn = document.getElementById("crisisBtn");
    btn.disabled = true; btn.textContent = "⚡ Crisis running…";

    // pick a critical order and starve its top SKU
    const target = S.orders.find(o => o.priority === "Critical" && o.status !== "Dispatched") || S.orders[0];
    const line = target.items[0];
    const p = P(line.sku);

    const steps = [
      () => {
        line.qty = 10; line.allocated = 0; line.backordered = 0;
        p.stock = 7 + p.reserved + p.damaged; // exactly 7 available
        target.status = "New"; target.priority = "Critical"; target.ageMin += 90;
        log("Crisis", `Cycle count correction: ${p.sku} on-hand dropped to ${available(p)} units while ${target.id} needs 10.`);
        toast("Stock shortage detected", `${p.sku}: 10 required, only ${available(p)} available for ${target.id}.`, "err");
        go("dashboard");
      },
      () => { runAllocation(true); toast("Smart allocation", `7 units allocated to ${target.id}, 3 backordered — reasoning logged.`, "warn"); go("allocation"); },
      () => { startPicking(target.id); go("picking"); },
      () => { completePick(target.id); go("packing"); },
      () => { packOrder(target.id); },
      () => { qcFail(target.id, "Damaged Item"); go("exceptions"); },
      () => {
        const dec = S.decisions.find(d => d.orderId === target.id && d.status === "Recommended" && d.title.includes("recovery"));
        go("decisions");
        if (dec) { toast("Recommendation ready", dec.action, "info"); setTimeout(() => applyDecision(dec.id), 1400); }
      },
      () => { if (S.orders.find(o => o.id === target.id).status === "Quality Check") qcPass(target.id); go("dashboard"); },
      () => {
        crisisRunning = false;
        btn.disabled = false; btn.textContent = "⚡ Run Warehouse Crisis";
        openModal("Crisis simulation complete", `
          <div class="reason ok"><b>Exception → Decision → Resolution</b> executed end-to-end on ${target.id}.</div>
          <div class="timeline">
            <div class="tl"><b>Exception 1 — Stock shortage.</b> ${p.name} dropped to 7 available against a 10-unit critical line.</div>
            <div class="tl"><b>Decision.</b> Allocate 7 now, backorder 3 against inbound — protects 70% of the line and the 2h SLA instead of holding everything.</div>
            <div class="tl"><b>Resolution.</b> Order released to picking on an optimised route, then packed.</div>
            <div class="tl"><b>Exception 2 — Damaged item at QC.</b> Units quarantined, order blocked.</div>
            <div class="tl"><b>Decision.</b> Swap from available stock (or ship short if none) — chosen over holding the shipment.</div>
            <div class="tl"><b>Resolution.</b> QC re-passed and the order dispatched.</div>
          </div>
          <p class="sub">Open the Decisions and Exceptions views for the full audit trail.</p>`);
      },
    ];
    steps.forEach((fn, i) => setTimeout(fn, i * 1700));
  }

  /* ---------------- Rendering ---------------- */
  const el = () => document.getElementById("view");
  let currentView = "dashboard";
  let filters = { invQ: "", invStatus: "all", ordPriority: "all", ordStatus: "all" };

  const TITLES = {
    dashboard: ["Dashboard", "Live operations overview"],
    inventory: ["Inventory", "Stock, reservations and reorder health"],
    orders: ["Orders", "Priority-ranked order book"],
    allocation: ["Allocation Engine", "Smart priority + inventory allocation"],
    picking: ["Picking", "Wave release, routes and warehouse map"],
    packing: ["Packing & Dispatch", "Cartonisation, quality check and shipping"],
    exceptions: ["Exception Center", "Damaged, missing and wrong items"],
    decisions: ["Decision Center", "AI recommendations with reasoning"],
    analytics: ["Analytics", "Throughput, bottlenecks and what-if"],
  };

  function kpis() {
    const open = S.orders.filter(o => o.status !== "Dispatched");
    const inv = S.products.reduce((s, p) => s + p.stock, 0);
    return {
      orders: open.length,
      inventory: inv,
      risk: S.orders.filter(atRisk).length,
      low: S.products.filter(p => available(p) < p.reorder).length,
      picking: S.orders.filter(o => o.status === "Picking").length,
      dispatch: S.orders.filter(o => ["Packing", "Quality Check"].includes(o.status)).length,
      dispatched: S.metrics.dispatched,
    };
  }

  function badge(text, cls) { return `<span class="badge ${cls}">${text}</span>`; }
  function statusBadge(o) { return badge(o.status, STATUS_CLS[o.status] || "b-grey"); }
  function prioBadge(o) { return badge(o.priority, PRIORITY[o.priority].cls); }

  function render() {
    document.getElementById("navExc").textContent = S.exceptions.filter(e => e.status === "Open").length;
    document.getElementById("navDec").textContent = S.decisions.filter(d => d.status === "Recommended").length;
    document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("active", a.dataset.view === currentView));
    const [t, s] = TITLES[currentView];
    document.getElementById("viewTitle").textContent = t;
    document.getElementById("viewSub").textContent = s;
    el().innerHTML = VIEWS[currentView]();
    bindDynamic();
  }

  function go(view) {
    if (!VIEWS[view]) view = "dashboard";
    currentView = view;
    location.hash = "#" + view;
    render();
    document.getElementById("sidebar").classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const VIEWS = {
    dashboard: () => {
      const k = kpis();
      const fill = S.metrics.allocations ? Math.round(100 - (S.metrics.backorders / (S.metrics.allocations + S.metrics.backorders)) * 100) : 100;
      const stages = ["New", "Allocated", "Backordered", "Picking", "Packing", "Quality Check", "Dispatched"];
      const counts = stages.map(st => S.orders.filter(o => o.status === st).length);
      const max = Math.max(1, ...counts);
      return `
      <div class="grid kpis">
        ${kpiCard("Open Orders", k.orders, `${k.dispatched} dispatched today`, "")}
        ${kpiCard("Inventory Units", fmt(k.inventory), `${S.products.length} active SKUs`, "sky")}
        ${kpiCard("At Risk", k.risk, "SLA or stock exposure", "danger")}
        ${kpiCard("Low Stock", k.low, "below reorder point", "warn")}
        ${kpiCard("In Picking", k.picking, "active pick tasks", "purple")}
        ${kpiCard("Ready to Dispatch", k.dispatch, "packing + QC queue", "")}
      </div>

      <div class="grid cols-2">
        <div class="card">
          <div class="card-head"><div><h3>Order pipeline</h3><div class="sub">Live stage distribution</div></div>${badge("Fill rate " + fill + "%", fill > 90 ? "b-green" : "b-yellow")}</div>
          <div class="chart">
            ${stages.map((st, i) => `<div class="col" title="${st}: ${counts[i]}">
              <div class="stack" style="height:${Math.max(6, (counts[i] / max) * 130)}px"></div>
              <div class="cap">${st.split(" ")[0]}</div><b style="font-size:12px">${counts[i]}</b></div>`).join("")}
          </div>
        </div>
        <div class="card">
          <h3>Operational health</h3><div class="sub">Weighted service indicators</div>
          ${barRow("Order fill rate", fill, fill > 90 ? "" : "warn")}
          ${barRow("Inventory health", Math.round(100 - (S.products.filter(p => available(p) < p.reorder).length / S.products.length) * 100), "")}
          ${barRow("Exception resolution", S.exceptions.length ? Math.round(S.exceptions.filter(e => e.status === "Resolved").length / S.exceptions.length * 100) : 100, "purple")}
          ${barRow("Dock utilisation", Math.min(100, 45 + S.metrics.dispatched * 9), "warn")}
          ${barRow("Pick accuracy", 96, "")}
        </div>
      </div>

      <div class="grid cols-2">
        <div class="card">
          <div class="card-head"><div><h3>Priority queue</h3><div class="sub">Top ranked by engine score</div></div><button class="btn btn-sm btn-primary" data-go="orders">View all</button></div>
          <div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Priority</th><th>Score</th><th>Status</th></tr></thead><tbody>
          ${S.orders.filter(o => o.status !== "Dispatched").sort((a, b) => priorityScore(b) - priorityScore(a)).slice(0, 6).map(o => `
            <tr><td class="mono">${o.id}</td><td>${o.customer}</td><td>${prioBadge(o)}</td><td class="num">${priorityScore(o)}</td><td>${statusBadge(o)}</td></tr>`).join("")}
          </tbody></table></div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Live activity feed</h3><div class="sub">Latest engine and floor events</div></div></div>
          <div class="timeline">
            ${S.events.slice(0, 8).map(e => `<div class="tl"><b>${e.actor}</b> — ${e.text}<time>${e.t}</time></div>`).join("") || '<div class="empty">No activity yet.</div>'}
          </div>
        </div>
      </div>`;
    },

    inventory: () => {
      const list = S.products.filter(p => {
        const q = filters.invQ.toLowerCase();
        const okQ = !q || (p.name + p.sku + p.category + p.location).toLowerCase().includes(q);
        const st = stockStatus(p).label;
        const okS = filters.invStatus === "all"
          || (filters.invStatus === "low" && available(p) < p.reorder)
          || (filters.invStatus === "healthy" && st === "Healthy");
        return okQ && okS;
      });
      return `
      <div class="card">
        <div class="toolbar">
          <div class="field"><label>Search</label><input id="invQ" placeholder="SKU, name, category or location" value="${filters.invQ}"></div>
          <div class="field"><label>Status</label><select id="invStatus">
            <option value="all"${filters.invStatus === "all" ? " selected" : ""}>All SKUs</option>
            <option value="low"${filters.invStatus === "low" ? " selected" : ""}>Below reorder point</option>
            <option value="healthy"${filters.invStatus === "healthy" ? " selected" : ""}>Healthy only</option>
          </select></div>
          <button class="btn btn-primary" id="replenishAll">◈ Auto-replenish low stock</button>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Inventory ledger</h3><div class="sub">${list.length} of ${S.products.length} SKUs</div></div></div>
        <div class="table-wrap"><table>
        <thead><tr><th>SKU</th><th>Product</th><th>Loc</th><th>Stock</th><th>Reserved</th><th>Damaged</th><th>Available</th><th>Reorder</th><th>Coverage</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map(p => {
        const st = stockStatus(p), a = available(p);
        const cov = Math.min(100, Math.round((a / Math.max(1, p.reorder * 2)) * 100));
        return `<tr>
            <td class="mono">${p.sku}</td><td>${p.name}<br><span class="sub" style="font-size:11px">${p.category}</span></td>
            <td>${badge(p.location, "b-grey")}</td>
            <td class="num">${p.stock}</td><td class="num">${p.reserved}</td><td class="num">${p.damaged}</td>
            <td class="num"><b>${a}</b></td><td class="num">${p.reorder}</td>
            <td style="min-width:110px"><div class="bar ${cov < 30 ? "danger" : cov < 55 ? "warn" : ""}"><span style="width:${cov}%"></span></div></td>
            <td>${badge(st.label, st.cls)}</td>
            <td><button class="btn btn-sm" data-inbound="${p.sku}">+ Restock</button></td></tr>`;
      }).join("") || '<tr><td colspan="11" class="empty">No SKUs match your filters.</td></tr>'}</tbody></table></div>
      </div>`;
    },

    orders: () => {
      const list = S.orders.filter(o =>
        (filters.ordPriority === "all" || o.priority === filters.ordPriority) &&
        (filters.ordStatus === "all" || o.status === filters.ordStatus)
      ).sort((a, b) => priorityScore(b) - priorityScore(a));
      return `
      <div class="card"><div class="toolbar">
        <div class="field"><label>Priority</label><select id="ordPriority">
          ${["all", "Critical", "High", "Medium", "Low"].map(v => `<option value="${v}"${filters.ordPriority === v ? " selected" : ""}>${v === "all" ? "All priorities" : v}</option>`).join("")}
        </select></div>
        <div class="field"><label>Status</label><select id="ordStatus">
          ${["all", ...Object.keys(STATUS_CLS)].map(v => `<option value="${v}"${filters.ordStatus === v ? " selected" : ""}>${v === "all" ? "All statuses" : v}</option>`).join("")}
        </select></div>
        <button class="btn btn-primary" id="runEngine2">◈ Run allocation</button>
      </div></div>
      <div class="card">
        <div class="card-head"><div><h3>Order book</h3><div class="sub">${list.length} orders • ranked by engine score</div></div></div>
        <div class="table-wrap"><table>
        <thead><tr><th>Order</th><th>Customer</th><th>Priority</th><th>Score</th><th>Units</th><th>Allocated</th><th>Backorder</th><th>Value</th><th>Status</th><th>Risk</th><th></th></tr></thead>
        <tbody>${list.map(o => `<tr>
          <td class="mono">${o.id}</td><td>${o.customer}</td><td>${prioBadge(o)}</td><td class="num">${priorityScore(o)}</td>
          <td class="num">${orderQty(o)}</td><td class="num">${orderAllocated(o)}</td>
          <td class="num">${orderBackordered(o) ? `<span style="color:var(--red)">${orderBackordered(o)}</span>` : 0}</td>
          <td class="num">${money(o.value)}</td><td>${statusBadge(o)}</td>
          <td>${atRisk(o) ? badge("At risk", "b-red") : badge("On track", "b-green")}</td>
          <td><button class="btn btn-sm" data-order="${o.id}">Details</button></td></tr>`).join("") || '<tr><td colspan="11" class="empty">No orders match.</td></tr>'}</tbody></table></div>
      </div>`;
    },

    allocation: () => {
      const queue = S.orders.filter(o => o.status !== "Dispatched").sort((a, b) => priorityScore(b) - priorityScore(a));
      const back = S.orders.filter(o => orderBackordered(o) > 0);
      return `
      <div class="grid cols-3">
        ${kpiCard("Units allocated", fmt(S.metrics.allocations), "this session", "sky")}
        ${kpiCard("Units backordered", fmt(S.metrics.backorders), "awaiting inbound", "danger")}
        ${kpiCard("Fill rate", (S.metrics.allocations ? Math.round(S.metrics.allocations / (S.metrics.allocations + S.metrics.backorders) * 100) : 100) + "%", "allocated vs demanded", "")}
      </div>
      <div class="card">
        <div class="card-head"><div><h3>How the engine ranks work</h3><div class="sub">score = priority weight + SLA urgency + order value boost</div></div>
        <button class="btn btn-primary" id="runEngine3">◈ Run allocation pass</button></div>
        <div class="reason">Orders are sorted by score, then stock is committed line by line. When a line cannot be filled completely, the engine allocates every available unit to the highest-scoring order and backorders the remainder rather than holding the shipment — partial on-time delivery beats a fully late one, and a written decision record is created for every split.</div>
      </div>
      <div class="card">
        <h3>Allocation queue</h3><div class="sub">Live commitment plan</div>
        <div class="table-wrap"><table><thead><tr><th>Rank</th><th>Order</th><th>Priority</th><th>Score</th><th>Demand</th><th>Committed</th><th>Coverage</th><th>Status</th></tr></thead><tbody>
        ${queue.map((o, i) => {
        const pct = Math.round((orderAllocated(o) / Math.max(1, orderQty(o))) * 100);
        return `<tr><td class="num">#${i + 1}</td><td class="mono">${o.id}</td><td>${prioBadge(o)}</td><td class="num">${priorityScore(o)}</td>
          <td class="num">${orderQty(o)}</td><td class="num">${orderAllocated(o)}</td>
          <td style="min-width:130px"><div class="bar ${pct < 60 ? "danger" : pct < 100 ? "warn" : ""}"><span style="width:${pct}%"></span></div><span class="sub" style="font-size:11px">${pct}%</span></td>
          <td>${statusBadge(o)}</td></tr>`;
      }).join("")}</tbody></table></div>
      </div>
      <div class="card">
        <h3>Backorder exposure</h3><div class="sub">${back.length} orders carrying shortfalls</div>
        <div class="list">${back.map(o => `<div class="tile"><div class="tile-head"><span class="tile-title">${o.id} · ${o.customer}</span>${prioBadge(o)}</div>
          <p>${o.items.filter(i => i.backordered).map(i => `${i.backordered} × ${P(i.sku).name} (${i.sku}) short — inbound ${P(i.sku).inbound || 0}`).join("<br>")}</p>
          <div class="actions"><button class="btn btn-sm" data-order="${o.id}">Open order</button><button class="btn btn-sm btn-purple" data-go="decisions">See decisions</button></div></div>`).join("") || '<div class="empty">No backorders — every committed line is fully covered.</div>'}</div>
      </div>`;
    },

    picking: () => {
      const ready = S.orders.filter(o => ["Allocated", "Backordered"].includes(o.status) && orderAllocated(o) > 0);
      const active = S.orders.filter(o => o.status === "Picking");
      const routeSet = new Set(S.pickRoute);
      const cells = [];
      AISLES.forEach(a => {
        for (let i = 1; i <= 4; i++) {
          const loc = `${a}-${String(i).padStart(2, "0")}`;
          const prods = S.products.filter(p => p.location === loc);
          const hot = prods.some(p => available(p) < p.reorder);
          cells.push(`<div class="cell ${routeSet.has(loc) ? "route" : ""} ${hot ? "hot" : ""}" data-loc="${loc}">
            <b>${loc}</b><span>${prods.length} SKU${prods.length === 1 ? "" : "s"}</span>
            ${routeSet.has(loc) ? `<span class="idx">STOP ${S.pickRoute.indexOf(loc) + 1}</span>` : ""}</div>`);
        }
      });
      return `
      <div class="grid cols-2">
        <div class="card">
          <div class="card-head"><div><h3>Wave release</h3><div class="sub">${ready.length} orders ready to pick</div></div>
          <button class="btn btn-primary btn-sm" id="releaseWave">Release top 3</button></div>
          <div class="list">${ready.slice(0, 8).map(o => `<div class="tile"><div class="tile-head"><span class="tile-title">${o.id} · ${o.customer}</span>${prioBadge(o)}</div>
            <p>${orderAllocated(o)} units across ${o.items.length} line(s) · route ${buildRoute(o).join(" → ")}</p>
            <div class="actions"><button class="btn btn-sm btn-primary" data-pick="${o.id}">Start picking</button><button class="btn btn-sm" data-order="${o.id}">Details</button></div></div>`).join("") || '<div class="empty">Nothing allocated yet — run the allocation engine.</div>'}</div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Active pick tasks</h3><div class="sub">${active.length} pickers on the floor</div></div></div>
          <div class="list">${active.map(o => `<div class="tile"><div class="tile-head"><span class="tile-title">${o.id}</span>${badge("Picking", "b-yellow")}</div>
            <p>Route: ${o.route.join(" → ")}</p>
            <div class="bar warn" style="margin-top:10px"><span style="width:${40 + Math.random() * 40}%"></span></div>
            <div class="actions"><button class="btn btn-sm btn-primary" data-pickdone="${o.id}">Complete pick</button>
            <button class="btn btn-sm" data-showroute="${o.id}">Show route</button></div></div>`).join("") || '<div class="empty">No active pick tasks.</div>'}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>Warehouse map</h3><div class="sub">Green = current pick route · red border = low stock location</div></div>
        <button class="btn btn-sm btn-ghost" id="clearRoute">Clear route</button></div>
        <div class="map">${cells.join("")}</div>
      </div>`;
    },

    packing: () => {
      const packing = S.orders.filter(o => o.status === "Packing");
      const qc = S.orders.filter(o => o.status === "Quality Check");
      const blocked = S.orders.filter(o => o.status === "Blocked");
      const done = S.orders.filter(o => o.status === "Dispatched");
      return `
      <div class="grid cols-3">
        ${kpiCard("At packing", packing.length, "cartonisation queue", "purple")}
        ${kpiCard("In quality check", qc.length, "awaiting verification", "warn")}
        ${kpiCard("Dispatched", done.length, "shipped today", "")}
      </div>
      <div class="grid cols-2">
        <div class="card"><h3>Packing station</h3><div class="sub">Auto-cartonisation</div>
          <div class="list">${packing.map(o => `<div class="tile"><div class="tile-head"><span class="tile-title">${o.id} · ${o.customer}</span>${prioBadge(o)}</div>
            <p>${o.items.reduce((s, i) => s + i.picked, 0)} units picked → suggested ${Math.max(1, Math.ceil(o.items.reduce((s, i) => s + i.picked, 0) / 12))} carton(s)</p>
            <div class="actions"><button class="btn btn-sm btn-primary" data-pack="${o.id}">Pack & send to QC</button></div></div>`).join("") || '<div class="empty">Packing queue is clear.</div>'}</div>
        </div>
        <div class="card"><h3>Quality check & dispatch</h3><div class="sub">QC-2 verification station</div>
          <div class="list">${qc.map(o => `<div class="tile"><div class="tile-head"><span class="tile-title">${o.id}</span>${badge(o.cartons + " cartons", "b-grey")}</div>
            <p>Verify counts, labels and seals before dock release.</p>
            <div class="actions">
              <button class="btn btn-sm btn-primary" data-qcpass="${o.id}">Pass & dispatch</button>
              <button class="btn btn-sm" data-qcfail="${o.id}|Damaged Item">Flag damaged</button>
              <button class="btn btn-sm" data-qcfail="${o.id}|Missing Item">Flag missing</button>
              <button class="btn btn-sm" data-qcfail="${o.id}|Wrong Item">Flag wrong item</button>
            </div></div>`).join("") || '<div class="empty">No orders awaiting quality check.</div>'}
            ${blocked.map(o => `<div class="tile"><div class="tile-head"><span class="tile-title">${o.id}</span>${badge("Blocked", "b-red")}</div>
              <p>Blocked by an open exception. Resolve it in the Decision Center to release the shipment.</p>
              <div class="actions"><button class="btn btn-sm btn-purple" data-go="decisions">Open decisions</button></div></div>`).join("")}
          </div>
        </div>
      </div>
      <div class="card"><h3>Dispatched manifest</h3><div class="sub">${done.length} shipments completed</div>
        <div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Priority</th><th>Units</th><th>Value</th><th>Time</th></tr></thead>
        <tbody>${done.map(o => `<tr><td class="mono">${o.id}</td><td>${o.customer}</td><td>${prioBadge(o)}</td>
          <td class="num">${o.items.reduce((s, i) => s + i.picked, 0)}</td><td class="num">${money(o.value)}</td><td>${timeStr(o.dispatchedAt)}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">No dispatches yet.</td></tr>'}</tbody></table></div>
      </div>`;
    },

    exceptions: () => {
      const open = S.exceptions.filter(e => e.status === "Open");
      const resolved = S.exceptions.filter(e => e.status === "Resolved");
      const card = (e) => {
        const d = S.decisions.find(x => x.id === e.decisionId);
        return `<div class="tile">
          <div class="tile-head"><span class="tile-title">${e.title}</span>
            ${badge(e.severity, e.severity === "Critical" ? "b-red" : "b-yellow")} ${badge(e.type, "b-purple")} ${badge(e.status, e.status === "Open" ? "b-red" : "b-green")}</div>
          <p>${e.detail} ${e.orderId ? "Order <span class='mono'>" + e.orderId + "</span>." : ""} Raised ${e.t}.</p>
          ${d ? `<div class="reason"><b>Decision:</b> ${d.action} — ${d.title}</div>` : ""}
          ${e.resolution ? `<div class="reason ok"><b>Resolution:</b> ${e.resolution}</div>` : ""}
          <div class="flow"><span class="step done">Exception</span><span class="arrow">→</span>
            <span class="step ${d ? "done" : ""}">Decision</span><span class="arrow">→</span>
            <span class="step ${e.status === "Resolved" ? "done" : ""}">Resolution</span></div>
          <div class="actions">
            ${d && d.status === "Recommended" ? `<button class="btn btn-sm btn-primary" data-apply="${d.id}">Apply recommendation</button>` : ""}
            ${e.status === "Open" ? `<button class="btn btn-sm" data-resolve="${e.id}">Resolve manually</button>` : ""}
            ${e.orderId ? `<button class="btn btn-sm" data-order="${e.orderId}">Open order</button>` : ""}
          </div></div>`;
      };
      return `
      <div class="grid cols-3">
        ${kpiCard("Open exceptions", open.length, "needing action", "danger")}
        ${kpiCard("Resolved", resolved.length, "closed with decision", "")}
        ${kpiCard("Critical severity", S.exceptions.filter(e => e.severity === "Critical" && e.status === "Open").length, "escalated", "warn")}
      </div>
      <div class="card"><div class="card-head"><div><h3>Open exceptions</h3><div class="sub">Every issue routes through Exception → Decision → Resolution</div></div>
        <button class="btn btn-sm" id="simulateExc">Simulate damaged item</button></div>
        <div class="list">${open.map(card).join("") || '<div class="empty">No open exceptions. The floor is clean.</div>'}</div>
      </div>
      <div class="card"><h3>Resolved history</h3><div class="sub">Audit trail</div>
        <div class="list">${resolved.slice(0, 8).map(card).join("") || '<div class="empty">Nothing resolved yet.</div>'}</div>
      </div>`;
    },

    decisions: () => {
      const rec = S.decisions.filter(d => d.status === "Recommended");
      const hist = S.decisions.filter(d => d.status !== "Recommended");
      const card = (d) => `<div class="tile">
        <div class="tile-head"><span class="tile-title">${d.title}</span>
          ${badge(d.impact + " impact", d.impact === "High" ? "b-red" : d.impact === "Medium" ? "b-yellow" : "b-sky")}
          ${badge(d.status, d.status === "Applied" ? "b-green" : d.status === "Rejected" ? "b-grey" : "b-purple")}</div>
        <p><b>Recommended action:</b> ${d.action}</p>
        <div class="list" style="margin-top:10px;gap:6px">
          ${d.options.map(o => `<div style="font-size:12.5px;color:${o.chosen ? "var(--green)" : "var(--muted)"}">${o.chosen ? "✔" : "○"} ${o.label}${o.chosen ? " <b>(selected)</b>" : ""}</div>`).join("")}
        </div>
        <div class="reason"><b>Why this option:</b> ${d.why}</div>
        ${d.resolution ? `<div class="reason ok"><b>Resolution:</b> ${d.resolution}</div>` : ""}
        <div class="actions">
          ${d.status === "Recommended" ? `<button class="btn btn-sm btn-primary" data-apply="${d.id}">Apply</button>
            <button class="btn btn-sm" data-reject="${d.id}">Override</button>` : ""}
          ${d.orderId ? `<button class="btn btn-sm" data-order="${d.orderId}">Open ${d.orderId}</button>` : ""}
        </div></div>`;
      return `
      <div class="grid cols-3">
        ${kpiCard("Pending decisions", rec.length, "awaiting approval", "purple")}
        ${kpiCard("Applied", S.decisions.filter(d => d.status === "Applied").length, "auto-resolved", "")}
        ${kpiCard("Overridden", S.decisions.filter(d => d.status === "Rejected").length, "manual handling", "warn")}
      </div>
      <div class="card"><div class="card-head"><div><h3>Recommendations</h3><div class="sub">Each option is scored against SLA, value and stock exposure</div></div>
        <button class="btn btn-sm btn-primary" id="applyAll">Apply all high impact</button></div>
        <div class="list">${rec.map(card).join("") || '<div class="empty">No pending recommendations.</div>'}</div>
      </div>
      <div class="card"><h3>Decision history</h3><div class="sub">${hist.length} closed</div>
        <div class="list">${hist.slice(0, 10).map(card).join("") || '<div class="empty">No decisions closed yet.</div>'}</div>
      </div>`;
    },

    analytics: () => {
      const byPrio = ["Critical", "High", "Medium", "Low"].map(p => ({ p, n: S.orders.filter(o => o.priority === p).length }));
      const total = S.orders.length;
      const colors = { Critical: "var(--red)", High: "var(--purple)", Medium: "var(--yellow)", Low: "var(--sky)" };
      let acc = 0;
      const segs = byPrio.map(b => { const from = acc; acc += (b.n / total) * 100; return `${colors[b.p]} ${from}% ${acc}%`; }).join(",");
      const stages = [
        { s: "Allocation", n: S.orders.filter(o => ["New"].includes(o.status)).length, cap: 12 },
        { s: "Picking", n: S.orders.filter(o => ["Allocated", "Backordered"].includes(o.status)).length, cap: 8 },
        { s: "Packing", n: S.orders.filter(o => o.status === "Picking").length, cap: 6 },
        { s: "Quality Check", n: S.orders.filter(o => o.status === "Packing").length, cap: 5 },
        { s: "Dispatch", n: S.orders.filter(o => o.status === "Quality Check").length, cap: 6 },
      ];
      const bottleneck = stages.slice().sort((a, b) => (b.n / b.cap) - (a.n / a.cap))[0];
      const avgCycle = S.metrics.cycleTimes.length ? Math.round(S.metrics.cycleTimes.reduce((a, b) => a + b, 0) / S.metrics.cycleTimes.length) : 0;
      const hours = ["08", "10", "12", "14", "16", "18", "20"];
      const tp = hours.map((h, i) => 8 + Math.round(Math.abs(Math.sin(i * 1.1)) * 22) + S.metrics.dispatched);
      const maxTp = Math.max(...tp);
      return `
      <div class="grid cols-3">
        ${kpiCard("Avg cycle time", avgCycle ? avgCycle + " min" : "—", "order → dock", "sky")}
        ${kpiCard("Throughput", fmt(tp.reduce((a, b) => a + b, 0)), "units shipped today", "")}
        ${kpiCard("Bottleneck", bottleneck.s, Math.round((bottleneck.n / bottleneck.cap) * 100) + "% of station capacity", "danger")}
      </div>
      <div class="grid cols-2">
        <div class="card"><h3>Hourly throughput</h3><div class="sub">Units shipped per hour</div>
          <div class="chart">${tp.map((v, i) => `<div class="col" title="${v} units"><div class="stack" style="height:${(v / maxTp) * 130}px"></div><div class="cap">${hours[i]}:00</div></div>`).join("")}</div>
        </div>
        <div class="card"><h3>Order mix by priority</h3><div class="sub">${total} orders in scope</div>
          <div class="donut" style="background:conic-gradient(${segs})"><div class="mid"><b>${total}</b><span>orders</span></div></div>
          <div class="legend">${byPrio.map(b => `<span><i style="background:${colors[b.p]}"></i>${b.p} · ${b.n}</span>`).join("")}</div>
        </div>
      </div>
      <div class="card"><h3>Bottleneck detection</h3><div class="sub">Queue load vs station capacity — anything above 80% is flagged</div>
        ${stages.map(s => { const pct = Math.min(100, Math.round((s.n / s.cap) * 100)); return barRow(`${s.s} (${s.n}/${s.cap})`, pct, pct > 80 ? "danger" : pct > 55 ? "warn" : ""); }).join("")}
        <div class="reason warn"><b>Engine insight:</b> ${bottleneck.s} is the constraining station at ${Math.round((bottleneck.n / bottleneck.cap) * 100)}% load. Recommended action: shift one operator from the lightest station and release the next wave in two smaller batches to smooth the queue.</div>
      </div>
      <div class="card"><div class="card-head"><div><h3>What-if simulator</h3><div class="sub">Model a stock shortage before it happens</div></div></div>
        <div class="toolbar">
          <div class="field"><label>SKU</label><select id="simSku">${S.products.map(p => `<option value="${p.sku}">${p.sku} — ${p.name} (${available(p)} avail)</option>`).join("")}</select></div>
          <div class="field"><label>Stock loss %</label><input id="simPct" type="number" min="1" max="100" value="60"></div>
          <button class="btn btn-primary" id="simRun">Run simulation</button>
        </div>
        <div id="simOut"></div>
      </div>`;
    },
  };

  function kpiCard(label, value, delta, cls) {
    return `<div class="card kpi ${cls}"><div class="label">${label}</div><div class="value">${value}</div><div class="delta">${delta}</div></div>`;
  }
  function barRow(label, pct, cls) {
    return `<div class="bar-row"><div class="top"><span>${label}</span><b>${pct}%</b></div><div class="bar ${cls}"><span style="width:${pct}%"></span></div></div>`;
  }

  /* ---------------- Modal ---------------- */
  function openModal(title, html) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalBody").innerHTML = html;
    document.getElementById("modalBackdrop").classList.add("open");
  }
  function closeModal() { document.getElementById("modalBackdrop").classList.remove("open"); }

  function orderModal(id) {
    const o = S.orders.find(x => x.id === id);
    if (!o) return;
    openModal(`${o.id} · ${o.customer}`, `
      <div style="display:flex;gap:8px;flex-wrap:wrap">${prioBadge(o)}${statusBadge(o)}${badge("Score " + priorityScore(o), "b-sky")}${badge(money(o.value), "b-grey")}${atRisk(o) ? badge("At risk", "b-red") : ""}</div>
      <div class="table-wrap"><table style="min-width:auto"><thead><tr><th>SKU</th><th>Product</th><th>Loc</th><th>Req</th><th>Alloc</th><th>Back</th><th>Picked</th></tr></thead>
      <tbody>${o.items.map(i => { const p = P(i.sku); return `<tr><td class="mono">${i.sku}</td><td>${p.name}</td><td>${p.location}</td>
        <td class="num">${i.qty}</td><td class="num">${i.allocated}</td><td class="num">${i.backordered}</td><td class="num">${i.picked}</td></tr>`; }).join("")}</tbody></table></div>
      <div class="flow">${["New", "Allocated", "Picking", "Packing", "Quality Check", "Dispatched"].map(st => {
      const order = ["New", "Allocated", "Picking", "Packing", "Quality Check", "Dispatched"];
      const cur = order.indexOf(o.status === "Backordered" ? "Allocated" : o.status === "Blocked" ? "Quality Check" : o.status);
      return `<span class="step ${order.indexOf(st) <= cur ? "done" : ""}">${st}</span>`;
    }).join('<span class="arrow">→</span>')}</div>
      <h3 style="font-family:var(--display);font-size:14px;margin-top:6px">Audit trail</h3>
      <div class="timeline">${o.log.map(l => `<div class="tl">${l.text}<time>${l.t}</time></div>`).join("")}</div>
      ${o.decisionIds.length ? `<div class="reason"><b>${o.decisionIds.length}</b> engine decision(s) attached — see the Decision Center.</div>` : ""}
    `);
  }

  /* ---------------- Event wiring ---------------- */
  function bindDynamic() {
    const q = (id) => document.getElementById(id);
    const on = (id, ev, fn) => { const e = q(id); if (e) e.addEventListener(ev, fn); };

    on("invQ", "input", (e) => { filters.invQ = e.target.value; const pos = e.target.selectionStart; render(); const n = q("invQ"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } });
    on("invStatus", "change", (e) => { filters.invStatus = e.target.value; render(); });
    on("ordPriority", "change", (e) => { filters.ordPriority = e.target.value; render(); });
    on("ordStatus", "change", (e) => { filters.ordStatus = e.target.value; render(); });
    on("runEngine2", "click", () => runAllocation());
    on("runEngine3", "click", () => runAllocation());
    on("replenishAll", "click", () => {
      let n = 0;
      S.products.filter(p => available(p) < p.reorder).forEach(p => { p.inbound += p.reorder * 2; p.stock += p.reorder; n++; });
      log("Procurement", `Auto-replenishment executed for ${n} SKUs.`);
      toast("Replenishment", `${n} SKU(s) topped up and inbound POs raised.`, "ok");
      render();
    });
    on("releaseWave", "click", () => {
      const ready = S.orders.filter(o => ["Allocated", "Backordered"].includes(o.status) && orderAllocated(o) > 0)
        .sort((a, b) => priorityScore(b) - priorityScore(a)).slice(0, 3);
      if (!ready.length) return toast("Nothing to release", "Run the allocation engine first.", "warn");
      ready.forEach(o => startPicking(o.id));
      toast("Wave released", `${ready.length} orders released to the floor.`, "ok");
    });
    on("clearRoute", "click", () => { S.pickRoute = []; render(); });
    on("simulateExc", "click", () => {
      const cand = S.orders.find(o => o.status === "Quality Check") || S.orders.find(o => ["Packing", "Picking"].includes(o.status));
      if (!cand) return toast("No candidate order", "Move an order into picking or packing first.", "warn");
      if (cand.status !== "Quality Check") { cand.items.forEach(i => i.picked = i.picked || i.allocated); cand.status = "Quality Check"; cand.cartons = 2; }
      qcFail(cand.id, "Damaged Item");
    });
    on("applyAll", "click", () => {
      const list = S.decisions.filter(d => d.status === "Recommended" && d.impact === "High");
      if (!list.length) return toast("Nothing to apply", "No high-impact recommendations pending.", "warn");
      list.forEach(d => applyDecision(d.id));
    });
    on("simRun", "click", () => {
      const sku = q("simSku").value;
      const pct = Math.min(100, Math.max(1, Number(q("simPct").value) || 50));
      const r = simulate(sku, pct);
      q("simOut").innerHTML = `
        <div class="reason ${r.shorted.length ? "warn" : "ok"}" style="margin-top:16px">
          <b>Scenario:</b> ${pct}% of ${r.p.name} (${r.p.sku}) becomes unusable → ${r.lost} units lost, ${r.projected} available.
          ${r.shorted.length ? `<b>${r.shorted.length}</b> order(s) would be short. The engine would protect the highest-scoring orders first and backorder the rest.` : "No open order would be short — buffer stock absorbs the loss."}
        </div>
        <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Order</th><th>Priority</th><th>Score</th><th>Needs</th><th>Would get</th><th>Short</th><th>Outcome</th></tr></thead><tbody>
        ${r.rows.map(x => `<tr><td class="mono">${x.o.id}</td><td>${prioBadge(x.o)}</td><td class="num">${priorityScore(x.o)}</td>
          <td class="num">${x.need}</td><td class="num">${x.give}</td><td class="num">${x.short}</td>
          <td>${x.short === 0 ? badge("Fully served", "b-green") : x.give ? badge("Partial + backorder", "b-yellow") : badge("Backordered", "b-red")}</td></tr>`).join("") || '<tr><td colspan="7" class="empty">No open orders use this SKU.</td></tr>'}
        </tbody></table></div>`;
    });

    el().querySelectorAll("[data-inbound]").forEach(b => b.addEventListener("click", () => {
      const p = P(b.dataset.inbound); p.stock += Math.max(20, p.reorder);
      toast("Restocked", `${p.sku} +${Math.max(20, p.reorder)} units received.`, "ok");
      log("Inbound", `${p.sku} restocked.`); render();
    }));
    document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
    el().querySelectorAll("[data-order]").forEach(b => b.addEventListener("click", () => orderModal(b.dataset.order)));
    el().querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => startPicking(b.dataset.pick)));
    el().querySelectorAll("[data-pickdone]").forEach(b => b.addEventListener("click", () => completePick(b.dataset.pickdone)));
    el().querySelectorAll("[data-showroute]").forEach(b => b.addEventListener("click", () => {
      const o = S.orders.find(x => x.id === b.dataset.showroute); S.pickRoute = o.route || buildRoute(o); render();
    }));
    el().querySelectorAll("[data-pack]").forEach(b => b.addEventListener("click", () => packOrder(b.dataset.pack)));
    el().querySelectorAll("[data-qcpass]").forEach(b => b.addEventListener("click", () => qcPass(b.dataset.qcpass)));
    el().querySelectorAll("[data-qcfail]").forEach(b => b.addEventListener("click", () => {
      const [id, kind] = b.dataset.qcfail.split("|"); qcFail(id, kind);
    }));
    el().querySelectorAll("[data-apply]").forEach(b => b.addEventListener("click", () => applyDecision(b.dataset.apply)));
    el().querySelectorAll("[data-reject]").forEach(b => b.addEventListener("click", () => rejectDecision(b.dataset.reject)));
    el().querySelectorAll("[data-resolve]").forEach(b => b.addEventListener("click", () => {
      const e = S.exceptions.find(x => x.id === b.dataset.resolve);
      e.status = "Resolved"; e.resolution = "Manually resolved by supervisor on the floor.";
      const o = e.orderId && S.orders.find(x => x.id === e.orderId);
      if (o && o.status === "Blocked") o.status = "Quality Check";
      toast("Exception resolved", e.title, "ok"); render();
    }));
    el().querySelectorAll("[data-loc]").forEach(c => c.addEventListener("click", () => {
      const loc = c.dataset.loc;
      const prods = S.products.filter(p => p.location === loc);
      openModal("Location " + loc, prods.length ? `<div class="list">${prods.map(p => `<div class="tile"><div class="tile-head"><span class="tile-title">${p.name}</span>${badge(stockStatus(p).label, stockStatus(p).cls)}</div>
        <p>${p.sku} · on hand ${p.stock} · reserved ${p.reserved} · available ${available(p)} · reorder ${p.reorder}</p></div>`).join("")}</div>`
        : '<div class="empty">Empty bin — available for putaway.</div>');
    }));
  }

  function bindStatic() {
    document.querySelectorAll("#nav a").forEach(a => a.addEventListener("click", (e) => { e.preventDefault(); go(a.dataset.view); }));
    document.getElementById("menuToggle").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
    document.getElementById("runEngineBtn").addEventListener("click", () => runAllocation());
    document.getElementById("crisisBtn").addEventListener("click", runCrisis);
    document.getElementById("resetBtn").addEventListener("click", () => {
      seed(); runAllocation(true); toast("Demo reset", "Fresh dataset loaded and allocated.", "ok"); go("dashboard");
    });
    document.getElementById("modalClose").addEventListener("click", closeModal);
    document.getElementById("modalBackdrop").addEventListener("click", (e) => { if (e.target.id === "modalBackdrop") closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
    window.addEventListener("hashchange", () => {
      const v = location.hash.replace("#", "");
      if (v && v !== currentView) go(v);
    });
    setInterval(() => {
      const c = document.getElementById("clock");
      if (c) c.textContent = "Shift A · " + timeStr();
    }, 1000);
  }

  /* ---------------- Boot ---------------- */
  seed();
  bindStatic();
  runAllocation(true);
  currentView = (location.hash.replace("#", "") in VIEWS) ? location.hash.replace("#", "") : "dashboard";
  render();
  toast("FlowStock AI online", "Allocation engine ran automatically on " + S.orders.length + " orders.", "ok");
})();
