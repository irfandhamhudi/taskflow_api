export const PROJECT_TEMPLATES = {
  software_development: {
    name: "Software Development",
    description: "Standard agile workflow for software teams.",
    icon: "💻",
    columns: [
      { title: "Backlog", status: "todo" },
      { title: "In Progress", status: "inprogress" },
      { title: "Testing", status: "review" },
      { title: "Done", status: "done" }
    ],
    initialTasks: [
      { title: "Setup Project Repository", description: "Initialize git and project structure.", status: "todo", priority: "high" },
      { title: "Design UI Mockups", description: "Create basic wireframes for the application.", status: "todo", priority: "medium" },
      { title: "Define API Routes", description: "List all necessary backend endpoints.", status: "todo", priority: "medium" }
    ]
  },
  marketing_campaign: {
    name: "Marketing Campaign",
    description: "Track marketing activities and content creation.",
    icon: "📣",
    columns: [
      { title: "Ideas", status: "todo" },
      { title: "Planning", status: "todo" },
      { title: "Execution", status: "inprogress" },
      { title: "Launched", status: "done" }
    ],
    initialTasks: [
      { title: "Goal Setting", description: "Define campaign KPIs and goals.", status: "todo", priority: "high" },
      { title: "Content Strategy", description: "Plan blog posts and social media content.", status: "todo", priority: "medium" },
      { title: "Budget Allocation", description: "Finalize budget for ad spend.", status: "todo", priority: "high" }
    ]
  },
  personal_todo: {
    name: "Personal TODO",
    description: "A simple list for your daily tasks.",
    icon: "📝",
    columns: [
      { title: "To Do", status: "todo" },
      { title: "Doing", status: "inprogress" },
      { title: "Done", status: "done" }
    ],
    initialTasks: [
      { title: "Morning Routine", description: "Meditation, Exercise, Breakfast.", status: "todo", priority: "medium" },
      { title: "Plan Tomorrow", description: "Write down top 3 priorities for tomorrow.", status: "todo", priority: "high" }
    ]
  }
};
