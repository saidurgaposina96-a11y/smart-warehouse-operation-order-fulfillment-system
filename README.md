# smart warehouse opertions &order fulfillment system

Build a complete, working hackathon project called **FlowStock AI** — a smart warehouse operations and order fulfillment system.

Use ONLY:

- HTML

- CSS

- Vanilla JavaScript

- Mock data

Create: `index.html`, `style.css`, `script.js`

### GOAL

Make it look like a **premium real-world warehouse control center**, NOT a basic CRUD/student project.

### FEATURES

- Dashboard with live KPIs: Orders, Inventory, At Risk, Low Stock, Picking, Dispatch

- Inventory management with stock, reserved, available, reorder point and status

- Order management with Critical/High/Medium/Low priority

- **Smart priority + inventory allocation engine**

- Picking and packing workflow

- Quality check and dispatch

- Exception center for damaged/missing/wrong items

- Decision Center with recommendations

- Analytics + bottleneck detection

- Warehouse map with picking route

- **What-If simulator** for stock shortages

### SMART DECISION EXAMPLE

If an urgent order needs 10 units but only 7 are available:

→ allocate 7 to the urgent order

→ mark 3 as backordered

→ explain WHY this decision was selected.

Every major problem must follow:

**Exception → Decision → Resolution**

### DESIGN

Create a highly attractive responsive UI:

- green/light sky blue dark gradient background

- Glassmorphism cards

- Modern sidebar

- Professional typography

- yellow/red/purple status indicators

- Smooth hover/transition animations

- Charts, progress bars, badges and modals

- CSS variables for colors

- Desktop + mobile responsive

Sidebar:

Dashboard | Inventory | Orders | Allocation | Picking | Packing | Exceptions | Decisions | Analytics

### DEMO

Include realistic mock data:

15+ products, 15+ orders and warehouse locations.

Add a **"Run Warehouse Crisis"** button that demonstrates:

stock shortage → smart allocation → damaged item → exception → recommendation → resolution → dispatch.

### IMPORTANT

All buttons and navigation MUST WORK.

Inventory and order states must update dynamically with JavaScript.

Do not create static/fake buttons.

Do not use external APIs.

After creating the files, RUN/TEST the project, fix JavaScript or UI errors, and make sure the complete workflow works.

**Do not explain first. Build the actual working project and provide the complete code/files.**

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://flow-wise-harmony-55.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6b28445a-1158-4f90-8005-732586fd8d60).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
