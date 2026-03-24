# Converting CrewAI to Timbal

## Overview

This reference maps CrewAI concepts to Timbal equivalents and provides codegen command sequences for common migration patterns. Use it when a user shares Python code using CrewAI (agents, tasks, crews, flows) and wants to rebuild it in Timbal.

The input will always be Python code (`.py` files, pasted snippets) or YAML config files (`agents.yaml`, `tasks.yaml`). CrewAI has no structured JSON export — read the code/config to identify the patterns.

---

## Identifying the CrewAI pattern

Look at imports and key classes:

| Pattern | How to recognize | Timbal entry point |
|---|---|---|
| **Single Agent** | `Agent(...)` used standalone with `agent.kickoff()` | **Agent** |
| **Crew (sequential)** | `Crew(process=Process.sequential)` | **Workflow** (each task → step) |
| **Crew (hierarchical)** | `Crew(process=Process.hierarchical)` | **Workflow** with a manager Agent step |
| **Flow** | `Flow`, `@start`, `@listen`, `@router` decorators | **Workflow** with conditional edges |

Start with an **Agent** only if the code uses a single CrewAI Agent with tools and no Crew. Everything else becomes a **Workflow**.

---

## Concept mapping

| CrewAI | What it does | Timbal equivalent | Codegen command |
|---|---|---|---|
| `Agent(role, goal, backstory, llm, tools)` | Defines an AI agent | Agent step in a Workflow (or the entry point Agent) | `add-step --type Agent --config '{...}'` |
| `role` + `goal` + `backstory` | Agent identity and instructions | `system_prompt` (combine into one prompt) | `set-config --config '{"system_prompt": "..."}'` |
| `llm="gpt-4o"` | Model selection | `model` field | `set-config --config '{"model": "openai/gpt-4o"}'` |
| `Task(description, expected_output, agent)` | A unit of work assigned to an agent | Workflow step (the agent step + its prompt) | `add-step --type Agent` + `set-param` for prompt |
| `Task.context=[task_a, task_b]` | Pass prior task outputs as input | `set-param --type map` from source steps | `set-param --target B --name prompt --type map --source A` |
| `Task.expected_output` | Describes desired output format | Include in `system_prompt` or step prompt | Part of the prompt text |
| `Task.output_pydantic` / `output_json` | Structured output | Custom step for parsing, or prompt engineering | `add-step --type Custom` if needed |
| `Crew(agents, tasks, process)` | Orchestrates agents and tasks | Workflow | Entry point is a Workflow |
| `Process.sequential` | Tasks run in order | Sequential edges | `add-edge --source A --target B` |
| `Process.hierarchical` | Manager delegates to agents | Workflow with a manager Agent step that has other agents as tools | More complex — see Pattern 3 |
| `@tool` decorator | Defines a tool function | Custom tool | `add-tool --type Custom --definition '...'` |
| `BaseTool` subclass | Complex/stateful tool | Custom tool | `add-tool --type Custom --definition '...'` |
| `SerperDevTool` / web search tools | Web search | Framework tool | `add-tool --type WebSearch` or `get-tools --search "web"` |
| `allow_delegation=True` | Agent can delegate to others | Not directly mapped — use a Workflow with explicit routing | Design as Workflow steps |
| `Memory(...)` | Conversation/knowledge memory | Handled automatically by Timbal runtime | N/A |
| `Flow` with `@start`, `@listen`, `@router` | Event-driven orchestration | Workflow with conditional edges | `add-edge --when` for router branches |
| `crew.kickoff(inputs={...})` | Run the crew | Workflow invocation with input params | `timbal-codegen test --input '{...}'` |
| YAML config (`agents.yaml`, `tasks.yaml`) | Declarative agent/task definitions | Read the YAML values and apply via codegen | Extract values → `add-step` + `set-config` |

### Key difference: implicit vs explicit data flow

CrewAI **implicitly** passes data between tasks — in sequential mode, each task automatically receives the previous task's output as context. The `context` parameter overrides this to pull from specific tasks.

Timbal uses **explicit wiring** — each step declares where its inputs come from using `set-param`. There is no implicit context passing. Every data dependency must be wired.

### Mapping `role` + `goal` + `backstory` to `system_prompt`

CrewAI splits agent identity across three fields. In Timbal, combine them into a single `system_prompt`:

```
You are a {role}.

Your goal: {goal}

Background: {backstory}
```

If the Task has `expected_output`, append it to the step's prompt:

```
Expected output: {expected_output}
```

---

## Decision: Agent vs Workflow

| CrewAI code shape | Timbal entry point | Why |
|---|---|---|
| Single `Agent` with tools, no `Crew` | **Agent** | One LLM + tools loop |
| `Crew` with one task and one agent | **Agent** | Effectively a single agent |
| `Crew` with multiple tasks (sequential) | **Workflow** | Multi-step pipeline |
| `Crew` with `Process.hierarchical` | **Workflow** | Multi-agent orchestration |
| `Flow` with `@start` / `@listen` / `@router` | **Workflow** | Event-driven pipeline with branching |

---

## Migration patterns

### Pattern 1: Single Agent with tools → Timbal Agent

**CrewAI:**
```python
from crewai import Agent
from crewai.tools import tool

@tool("Search Web")
def search_web(query: str) -> str:
    """Search the web for information."""
    # ...

@tool("Calculate")
def calculate(expression: str) -> str:
    """Evaluate a math expression."""
    import ast
    return str(ast.literal_eval(expression))

researcher = Agent(
    role="Research Analyst",
    goal="Find accurate information on any topic",
    backstory="Experienced analyst who always verifies sources",
    llm="gpt-4o",
    tools=[search_web, calculate],
)

result = researcher.kickoff("What is the population of France?")
```

**Timbal:**
```bash
timbal-codegen set-config --config '{
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "You are a Research Analyst.\n\nYour goal: Find accurate information on any topic.\n\nBackground: Experienced analyst who always verifies sources."
}'

timbal-codegen add-tool --type WebSearch

timbal-codegen add-tool --type Custom --definition '
def calculate(expression: str) -> str:
    """Evaluate a math expression."""
    import ast
    return str(ast.literal_eval(expression))
'
```

**What changed:**
- `Agent(role, goal, backstory)` → combined into `system_prompt`
- `llm="gpt-4o"` → `"model": "openai/gpt-4o"`
- `@tool` with external API → search for a framework tool first (`get-tools --search "web"`)
- `@tool` with custom logic → `add-tool --type Custom`
- `agent.kickoff()` → workflow invocation

### Pattern 2: Sequential Crew → Timbal Workflow

**CrewAI:**
```python
from crewai import Agent, Task, Crew, Process

researcher = Agent(
    role="Researcher",
    goal="Research the topic thoroughly",
    backstory="Expert researcher",
    llm="gpt-4o",
)

writer = Agent(
    role="Writer",
    goal="Write engaging content based on research",
    backstory="Skilled technical writer",
    llm="gpt-4o",
)

editor = Agent(
    role="Editor",
    goal="Polish and improve the content",
    backstory="Meticulous editor with an eye for detail",
    llm="gpt-4o",
)

research_task = Task(
    description="Research {topic} and provide key findings",
    expected_output="Bullet list of 10 key findings",
    agent=researcher,
)

writing_task = Task(
    description="Write a blog post based on the research",
    expected_output="A 500-word blog post in markdown",
    agent=writer,
    context=[research_task],
)

editing_task = Task(
    description="Edit and improve the blog post",
    expected_output="Polished final blog post",
    agent=editor,
    context=[writing_task],
)

crew = Crew(
    agents=[researcher, writer, editor],
    tasks=[research_task, writing_task, editing_task],
    process=Process.sequential,
)

result = crew.kickoff(inputs={"topic": "AI Agents"})
```

**Timbal:**
```bash
# Each CrewAI Agent+Task pair becomes one Agent step

timbal-codegen add-step --type Agent --config '{
  "name": "researcher",
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "You are a Researcher.\n\nYour goal: Research the topic thoroughly.\n\nBackground: Expert researcher.\n\nProvide your findings as a bullet list of 10 key findings."
}'

timbal-codegen add-step --type Agent --config '{
  "name": "writer",
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "You are a Writer.\n\nYour goal: Write engaging content based on research.\n\nBackground: Skilled technical writer.\n\nWrite a 500-word blog post in markdown based on the provided research."
}'

timbal-codegen add-step --type Agent --config '{
  "name": "editor",
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "You are an Editor.\n\nYour goal: Polish and improve the content.\n\nBackground: Meticulous editor with an eye for detail.\n\nEdit and improve the provided blog post into a polished final version."
}'

# Wire data flow (replaces implicit sequential context + Task.context)
timbal-codegen set-param --target writer --name prompt --type map --source researcher
timbal-codegen set-param --target editor --name prompt --type map --source writer

# Edges for ordering
timbal-codegen add-edge --source researcher --target writer
timbal-codegen add-edge --source writer --target editor
```

**What changed:**
- Each `Agent` + `Task` pair → one `add-step --type Agent`
- `role` + `goal` + `backstory` + `expected_output` → combined `system_prompt`
- `Task.context=[research_task]` → `set-param --type map --source researcher`
- `Process.sequential` → explicit `add-edge` calls
- `Crew` → Workflow entry point
- `crew.kickoff(inputs={...})` → workflow invocation params

### Pattern 3: Hierarchical Crew → Timbal Workflow

CrewAI's hierarchical process uses a manager agent that dynamically delegates tasks. Timbal doesn't have a built-in manager pattern, but you can replicate it with a top-level Agent step that has other workflow capabilities:

**CrewAI:**
```python
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    process=Process.hierarchical,
    manager_llm="gpt-4o",
)
```

**Timbal approach:** Convert to a sequential or conditional workflow where the steps are explicit. If the delegation logic is truly dynamic, use a single Agent with tools where each "sub-agent" becomes a tool:

```bash
# Option A: Convert to sequential (most common — hierarchical is often overkill)
# Same as Pattern 2 above

# Option B: Agent with sub-agent capabilities as tools
timbal-codegen set-config --config '{
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "You are a project manager. Use your tools to research topics and write content. Decide which tool to use based on the task at hand."
}'

timbal-codegen add-tool --type Custom --definition '
async def research(query: str) -> str:
    """Research a topic and return key findings."""
    # Implement as needed — could call another Timbal workflow
    pass
'

timbal-codegen add-tool --type Custom --definition '
async def write_content(topic: str, research: str) -> str:
    """Write content based on research findings."""
    # Implement as needed
    pass
'
```

### Pattern 4: Crew with parallel tasks → Timbal Workflow

**CrewAI:**
```python
research_task_a = Task(
    description="Research topic A",
    expected_output="Key findings on A",
    agent=researcher,
    async_execution=True,
)

research_task_b = Task(
    description="Research topic B",
    expected_output="Key findings on B",
    agent=researcher,
    async_execution=True,
)

combine_task = Task(
    description="Combine findings from both research tasks",
    expected_output="Combined analysis",
    agent=writer,
    context=[research_task_a, research_task_b],
)
```

**Timbal:**
```bash
# Two parallel steps (no edge between them = parallel by default)
timbal-codegen add-step --type Agent --config '{
  "name": "research_a",
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "Research topic A and provide key findings."
}'

timbal-codegen add-step --type Agent --config '{
  "name": "research_b",
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "Research topic B and provide key findings."
}'

# Combiner depends on both — creates the merge
timbal-codegen add-step --type Agent --config '{
  "name": "combiner",
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "Combine the findings from both research tasks into a unified analysis."
}'

timbal-codegen set-param --target combiner --name prompt --type map --source research_a
timbal-codegen set-param --target combiner --name context --type map --source research_b
```

**What changed:**
- `async_execution=True` → no edge between steps (parallel by default in Timbal)
- `context=[task_a, task_b]` → multiple `set-param` calls to wire both sources

### Pattern 5: CrewAI Flow → Timbal Workflow

**CrewAI:**
```python
from crewai.flow.flow import Flow, listen, start, router
from pydantic import BaseModel

class PipelineState(BaseModel):
    topic: str = ""
    research: str = ""
    draft: str = ""

class ContentFlow(Flow[PipelineState]):
    @start()
    def begin(self):
        self.state.topic = "AI Agents"

    @listen(begin)
    def do_research(self):
        crew = ResearchCrew()
        result = crew.crew().kickoff(inputs={"topic": self.state.topic})
        self.state.research = result.raw

    @listen(do_research)
    def write_draft(self):
        crew = WritingCrew()
        result = crew.crew().kickoff(inputs={"research": self.state.research})
        self.state.draft = result.raw

    @router(write_draft)
    def quality_check(self):
        if len(self.state.draft) > 500:
            return "publish"
        return "revise"

    @listen("publish")
    def publish(self):
        return self.state.draft

    @listen("revise")
    def revise(self):
        # loops back or does additional work
        pass
```

**Timbal:**
```bash
timbal-codegen add-step --type Agent --config '{
  "name": "researcher",
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "Research the given topic thoroughly."
}'

timbal-codegen add-step --type Agent --config '{
  "name": "writer",
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "Write a detailed draft based on the provided research. Aim for at least 500 words."
}'

timbal-codegen add-step --type Custom --definition '
def publish(draft: str) -> str:
    """Publish the final draft."""
    return draft
'

timbal-codegen add-step --type Custom --definition '
def revise(draft: str) -> str:
    """Flag draft for revision."""
    return f"NEEDS REVISION: {draft}"
'

# Wire data
timbal-codegen set-param --target writer --name prompt --type map --source researcher
timbal-codegen set-param --target publish --name draft --type map --source writer
timbal-codegen set-param --target revise --name draft --type map --source writer

# Edges — sequential flow + conditional routing
timbal-codegen add-edge --source researcher --target writer

# @router becomes conditional edges
timbal-codegen add-edge --source writer --target publish \
  --when 'lambda: len(get_run_context().step_span("writer").output.content) > 500'

timbal-codegen add-edge --source writer --target revise \
  --when 'lambda: len(get_run_context().step_span("writer").output.content) <= 500'
```

**What changed:**
- `Flow[State]` → Workflow entry point
- `@start` / `@listen` → steps + edges
- `@router` returning string labels → conditional `add-edge --when` calls
- `PipelineState` (Pydantic model) → explicit `set-param` wiring (no shared state)
- Sub-crews inside flow methods → inline as Agent steps

---

## Reading YAML config files

When users share `agents.yaml` and `tasks.yaml`, extract the values and apply via codegen:

**agents.yaml:**
```yaml
researcher:
  role: "Senior Data Researcher"
  goal: "Uncover cutting-edge developments in {topic}"
  backstory: "Seasoned researcher with a knack for finding insights"
```

**tasks.yaml:**
```yaml
research_task:
  description: "Conduct thorough research about {topic}"
  expected_output: "10 bullet points of key findings"
  agent: researcher
```

**Timbal migration:**
```bash
# Combine role + goal + backstory + expected_output into system_prompt
timbal-codegen add-step --type Agent --config '{
  "name": "researcher",
  "model": "openai/gpt-4o",
  "max_tokens": 4096,
  "system_prompt": "You are a Senior Data Researcher.\n\nYour goal: Uncover cutting-edge developments in the given topic.\n\nBackground: Seasoned researcher with a knack for finding insights.\n\nConduct thorough research and provide 10 bullet points of key findings."
}'
```

Note: CrewAI `{topic}` template variables become workflow input params — the user passes them at invocation time.

---

## Step-by-step migration process

1. **Read the CrewAI code** — identify agents, tasks, crew config, tools, and any flows
2. **Check for YAML configs** — if using `@CrewBase`, also read `agents.yaml` and `tasks.yaml`
3. **Choose entry point** — Agent (single agent + tools) or Workflow (multi-agent crew). See the decision table
4. **Map the model** — extract `llm=` from each agent. Use `get-models --search "..."` to find the Timbal model ID
5. **Map tools** — for each `@tool` or `BaseTool`, check if a framework tool exists (`get-tools --search "..."`) before writing a custom one
6. **Build the system prompts** — combine `role` + `goal` + `backstory` + `expected_output` for each agent
7. **Add the steps** — `add-step --type Agent` for each Agent+Task pair
8. **Wire data flow** — trace `Task.context` dependencies and sequential ordering → `set-param` to connect them
9. **Add ordering and conditions** — `add-edge` for sequential flow, `add-edge --when` for router/conditional branches
10. **Drop the boilerplate** — `Crew`, `Process`, `Memory`, `CrewBase`, callbacks, guardrails — these are handled by Timbal's runtime or don't have direct equivalents

---

## Things that don't map directly

| CrewAI feature | Timbal approach |
|---|---|
| **`role` + `goal` + `backstory`** | Combine into a single `system_prompt` |
| **`expected_output`** | Include in the step's prompt or system prompt |
| **`allow_delegation`** | Design explicit routing in the Workflow — no implicit delegation |
| **`Process.hierarchical`** | Convert to sequential workflow, or use an Agent with sub-capabilities as tools |
| **`Memory(...)`** | Timbal manages conversation context automatically |
| **`guardrail` / `guardrails`** | Implement validation in a custom step after the agent step |
| **`output_file`** | Use a custom step to write files if needed |
| **`human_input=True`** | Not supported in automated workflows — design for full automation |
| **`max_rpm` / rate limiting** | Handled by Timbal's runtime |
| **`cache=True`** | Handled by Timbal's runtime |
| **`verbose=True` / logging** | Use Timbal platform for observability |
| **`@before_kickoff` / `@after_kickoff`** | Use pre/post-processing custom steps in the Workflow |
| **`crew.kickoff_for_each`** | Call the workflow multiple times or build a loop in a custom step |
| **CrewAI Flows `@persist`** | No direct equivalent — design workflows to be stateless per invocation |
