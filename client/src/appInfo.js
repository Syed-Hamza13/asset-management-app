// Single source of truth for the About overlay and the sidebar title. The client
// bundle cannot read package.json at runtime, so `version` here and the version
// fields in package.json (root, client, server) must be bumped together.
export const APP = {
  name: "Asset Manager",
  version: "1.0.0",
  tagline: "Self-hosted asset register with dynamic forms, field automation and email notifications.",
  overview: [
    "Asset Manager is a digital register for every kind of asset an organisation keeps, from consumable stock to fixed office assets, instead of a spreadsheet or a paid vendor tool. Any number of asset types can live side by side, each with its own fields, forms, dropdowns, validation, automation rules, permissions and email notifications.",
    "It is a single self-hosted container: an Express API, a React client and a MySQL database. Everything is released as open source under the MIT License, which means it is free to use, study, modify and redistribute — including commercially.",
  ],
  features: [
    "Per-asset-type field definitions across nine field types, each with its own validation",
    "Automation rules that fill or clear fields while a form is being typed",
    "Capability-based roles, private-by-default ownership and shared asset types",
    "Reports with customisable columns and CSV / Excel export",
    "Per-user email rules on one global SMTP account, with an outbox and delivery history",
    "Quick Entry on the sign-in screen, notifications, and an IP allowlist for the whole app",
  ],
  license: {
    name: "MIT License",
    short: "MIT",
    url: "https://github.com/Syed-Hamza13/asset-management-app/blob/master/LICENSE",
    blurb:
      "Free to use, modify and redistribute with attribution. No warranty, no fees, no feature limits.",
  },
  repository: "https://github.com/Syed-Hamza13/asset-management-app",
  issues: "https://github.com/Syed-Hamza13/asset-management-app/issues",
  author: {
    name: "Syed Hamza",
    role: "Design & Development",
    email: "syed13hamza@gmail.com",
    github: "https://github.com/Syed-Hamza13",
    linkedin: "https://www.linkedin.com/in/syed-hamza-9452b0232",
  },
  contributors: ["Tariq Khan", "Eklavya Foundation"],
  techStack: [
    ["Client", "React 19, Vite 7, Tailwind CSS 4, React Router 7"],
    ["Server", "Node.js (ESM), Express 5, Zod, Helmet, Argon2"],
    ["Data", "MySQL 8 with numbered, tracked SQL migrations"],
    ["Email", "Nodemailer outbox worker with retry classification"],
    ["Auth", "Sessions, CSRF tokens, capability RBAC, IP allowlist"],
    ["Delivery", "One Docker container serving the API and the built client"],
  ],
  copyright: "© 2026 Syed Hamza",
};
