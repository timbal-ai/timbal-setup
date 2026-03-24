# Converting LangChain / LangGraph to Timbal

## Overview

This reference maps LangChain and LangGraph concepts to Timbal equivalents and provides codegen command sequences for common migration patterns. Use it when a user shares Python code using LangChain, LCEL, or LangGraph and wants to rebuild it in Timbal.

The input will always be Python code (`.py` files or pasted snippets). Read the code to identify which LangChain patterns are in use, then apply the appropriate mapping.

---

## Identifying the LangChain pattern

Look at imports and key classes to determine which pattern the user's code follows:

| Pattern | How to recognize | Timbal entry point |
|---|---|---|
| **LangChain Agent** | `AgentExecutor`, `create_react_agent`, `create_tool_calling_agent` | **Agent** |
| **LCEL chain** | `prompt \| llm \| parser` pipe syntax, `RunnableSequence` | **Workflow** (each pipe stage → step) |
| **LangGraph** | `StateGraph`, `add_node`, `add_edge`, `add_conditional_edges` | **Workflow** |
| **Legacy chain** | `LLMChain`, `SequentialChain`, `SimpleSequentialChain` | Treat as LCEL — same migration approach |

Start with an **Agent** if the code is a single LLM with tools. Use **Workflow** for anything with multiple stages, branching, or state.

---

## Concept mapping

| LangChain / LangGraph | What it does | Timbal equivalent | Codegen command |
|---|---|---|---|
| `ChatOpenAI`, `ChatAnthropic`, etc. | LLM provider | `model` field on Agent | `set-config --config '{"model": "openai/gpt-4o"}'` |
| `@tool` decorator | Defines a tool function | Custom tool | `add-tool --type Custom --definition '...'` |
| `Tool(name=..., func=...)` | Wraps a function as a tool | Custom tool | `add-tool --type Custom --definition '...'` |
| `AgentExecutor` | Runs an agent loop with tools | Agent (the core Timbal primitive) | Entry point is already an Agent |
| `create_react_agent` / `create_tool_calling_agent` | Creates an agent with a prompt + tools | Agent with `system_prompt` + tools | `set-config` + `add-tool` |
| `SystemMessage` / `ChatPromptTemplate` | System prompt / prompt template | `system_prompt` in Agent config | `set-config --config '{"system_prompt": "..."}'` |
| `PromptTemplate` + `format()` | Builds a prompt string from variables | Custom step that formats the string | `add-step --type Custom --definition '...'` |
| `StrOutputParser` / `JsonOutputParser` | Parses LLM output | Usually unnecessary — Timbal returns structured output. Use a custom step if format conversion is needed | `add-step --type Custom --definition '...'` |
| `RunnableSequence` (LCEL `\|` pipe) | Chains steps in sequence | Workflow with sequential steps | `add-step` for each stage + `set-param` to wire them |
| `RunnableParallel` | Runs branches in parallel | Workflow steps with no edges between them (parallel by default) | Multiple `add-step` calls, then merge via `set-param` |
| `RunnableLambda` | Wraps a function as a runnable | Custom step | `add-step --type Custom --definition '...'` |
| `StateGraph` | Defines a LangGraph workflow | Workflow | Entry point is a Workflow |
| LangGraph `add_node(name, func)` | Adds a node to the graph | Workflow step | `add-step --type Custom --definition '...'` or `add-step --type Agent` |
| LangGraph `add_edge(a, b)` | Connects two nodes | Edge | `add-edge --source a --target b` |
| LangGraph `add_conditional_edges` | Routes based on a condition | Conditional edges | `add-edge --source a --target b --when 'lambda: ...'` |
| LangGraph `State` (TypedDict) | Shared mutable state dict | Explicit params via `set-param` | `set-param --target step_b --name input --type map --source step_a` |
| LangGraph `START` / `END` | Entry and exit points | Workflow input params / final step output | N/A (implicit) |
| `ConversationBufferMemory` / memory classes | Conversation history | Handled automatically by Timbal's runtime | N/A |
| LangSmith tracing | Observability / tracing | Timbal platform — more complete and better integrated than LangSmith | N/A |

### Key difference: shared state vs explicit wiring

LangGraph uses a **shared mutable `State` dict** — every node reads from and writes to the same state object. Nodes receive the full state and return partial updates that get merged back.

Timbal uses **explicit wiring** — each step declares where its inputs come from using `set-param`. There is no shared state. This is more explicit but requires you to wire every data dependency.

When migrating, look at which `State` fields each LangGraph node reads, then use `set-param` to wire those from the node that writes them.

---

## Decision: Agent vs Workflow

| LangChain code shape | Timbal entry point | Why |
|---|---|---|
| `AgentExecutor` with tools | **Agent** | Single LLM + tools loop |
| `create_react_agent` / `create_tool_calling_agent` | **Agent** | Same — agent with tools |
| LCEL chain (`prompt \| llm \| parser`) | **Workflow** | Multi-step pipeline |
| `StateGraph` with multiple nodes | **Workflow** | Multi-step with edges |
| Agent + pre/post-processing | **Workflow** | Agent becomes one step among others |

---

## Migration patterns

### Pattern 1: LangChain Agent → Timbal Agent

**LangChain:**
```python
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool

@tool
def search_web(query: str) -> str:
    """Search the web for information."""
    # ...

@tool
def calculate(expression: str) -> str:
    """Evaluate a math expression."""
    import ast
    return str(ast.literal_eval(expression))

llm = ChatOpenAI(model="gpt-4o", temperature=0)
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful research assistant."),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(llm, [search_web, calculate], prompt)
executor = AgentExecutor(agent=agent, tools=[search_web, calculate])
```

**Timbal:**
```bash
# The entry point is already an Agent — just configure and add tools

timbal-codegen set-config \
  --config '{"model": "openai/gpt-4o", "temperature": 0, "system_prompt": "You are a helpful research assistant.", "max_tokens": 4096}'

timbal-codegen add-tool --type WebSearch

timbal-codegen add-tool --type Custom --definition '
def calculate(expression: str) -> str:
    """Evaluate a math expression."""
    import ast
    return str(ast.literal_eval(expression))
'
```

**What changed:**
- `ChatOpenAI(model=...)` → `set-config` with `model` and `temperature`
- `ChatPromptTemplate` system message → `system_prompt`
- `@tool` with external API → search for a framework tool first (`get-tools --search "web"`)
- `@tool` with custom logic → `add-tool --type Custom`
- `AgentExecutor` + `create_tool_calling_agent` → gone (Timbal Agent handles the loop)
- `{agent_scratchpad}` / `{input}` placeholders → gone (Timbal manages these internally)

### Pattern 2: LCEL chain → Timbal Workflow

**LangChain:**
```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

prompt = ChatPromptTemplate.from_messages([
    ("system", "Summarize the following text in 3 bullet points."),
    ("human", "{text}"),
])

llm = ChatOpenAI(model="gpt-4o")
parser = StrOutputParser()

chain = prompt | llm | parser
```

**Timbal:**
```bash
# LCEL pipes become a Workflow. This simple case is just one Agent step
# (prompt + LLM + parser collapses into a single Agent)

timbal-codegen add-step --type Agent \
  --config '{"name": "summarizer", "model": "openai/gpt-4o", "system_prompt": "Summarize the following text in 3 bullet points.", "max_tokens": 4096}'

timbal-codegen set-param --target summarizer --name prompt --type value --value '"Summarize this: {text}"'
```

**What changed:**
- `ChatPromptTemplate` → `system_prompt` on the Agent step
- `ChatOpenAI` → `model` field
- `StrOutputParser` → unnecessary (Timbal returns text directly)
- The entire `prompt | llm | parser` pipe → one Agent step

### Pattern 3: LCEL with parallel branches → Timbal Workflow

**LangChain:**
```python
from langchain_core.runnables import RunnableParallel, RunnableLambda
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o")

def summarize(text):
    return llm.invoke(f"Summarize: {text}")

def extract_keywords(text):
    return llm.invoke(f"Extract keywords from: {text}")

parallel = RunnableParallel(
    summary=RunnableLambda(summarize),
    keywords=RunnableLambda(extract_keywords),
)

def combine(results):
    return f"Summary: {results['summary']}\nKeywords: {results['keywords']}"

chain = parallel | RunnableLambda(combine)
```

**Timbal:**
```bash
# Two parallel Agent steps (no edge between them = parallel by default)
timbal-codegen add-step --type Agent \
  --config '{"name": "summarizer", "model": "openai/gpt-4o", "system_prompt": "Summarize the given text.", "max_tokens": 4096}'

timbal-codegen add-step --type Agent \
  --config '{"name": "keyword_extractor", "model": "openai/gpt-4o", "system_prompt": "Extract keywords from the given text.", "max_tokens": 4096}'

# Combiner step depends on both — this creates the merge
timbal-codegen add-step --type Custom --definition '
def combine(summary: str, keywords: str) -> str:
    return f"Summary: {summary}\nKeywords: {keywords}"
'

timbal-codegen set-param --target combine --name summary --type map --source summarizer
timbal-codegen set-param --target combine --name keywords --type map --source keyword_extractor
```

**What changed:**
- `RunnableParallel` → two steps with no edge (parallel by default in Timbal)
- `RunnableLambda(combine)` → custom step that depends on both via `set-param`
- Shared input is passed at invocation time — no need to explicitly fan out

### Pattern 4: LangGraph StateGraph → Timbal Workflow

**LangGraph:**
```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI

class State(TypedDict):
    query: str
    research: str
    draft: str
    final: str

llm = ChatOpenAI(model="gpt-4o")

def research(state: State) -> dict:
    result = llm.invoke(f"Research this topic: {state['query']}")
    return {"research": result.content}

def draft(state: State) -> dict:
    result = llm.invoke(f"Write a draft based on: {state['research']}")
    return {"draft": result.content}

def review(state: State) -> dict:
    result = llm.invoke(f"Review and improve: {state['draft']}")
    return {"final": result.content}

graph = StateGraph(State)
graph.add_node("research", research)
graph.add_node("draft", draft)
graph.add_node("review", review)

graph.add_edge(START, "research")
graph.add_edge("research", "draft")
graph.add_edge("draft", "review")
graph.add_edge("review", END)

app = graph.compile()
```

**Timbal:**
```bash
# Each LangGraph node becomes a Timbal step
# State field reads become set-param mappings

timbal-codegen add-step --type Agent \
  --config '{"name": "researcher", "model": "openai/gpt-4o", "system_prompt": "Research the given topic thoroughly.", "max_tokens": 4096}'

timbal-codegen add-step --type Agent \
  --config '{"name": "drafter", "model": "openai/gpt-4o", "system_prompt": "Write a draft based on the provided research.", "max_tokens": 4096}'

timbal-codegen add-step --type Agent \
  --config '{"name": "reviewer", "model": "openai/gpt-4o", "system_prompt": "Review and improve the provided draft.", "max_tokens": 4096}'

# Wire data flow (replaces State dict reads)
timbal-codegen set-param --target drafter --name prompt --type map --source researcher
timbal-codegen set-param --target reviewer --name prompt --type map --source drafter

# Edges for ordering
timbal-codegen add-edge --source researcher --target drafter
timbal-codegen add-edge --source drafter --target reviewer
```

**What changed:**
- `StateGraph(State)` → Workflow entry point
- `add_node(name, func)` → `add-step` for each node
- `add_edge(a, b)` → `add-edge --source a --target b`
- `state['field']` reads → `set-param --type map --source <step that wrote it>`
- `State` TypedDict → gone (no shared state — wiring is explicit)
- `START` / `END` → implicit (first step with no dependencies starts, last step's output is the result)

### Pattern 5: LangGraph conditional edges → Timbal conditional edges

**LangGraph:**
```python
def should_continue(state: State) -> str:
    if state["needs_revision"]:
        return "revise"
    return "publish"

graph.add_conditional_edges(
    "review",
    should_continue,
    {"revise": "draft", "publish": "publisher"},
)
```

**Timbal:**
```bash
# Each branch of add_conditional_edges becomes a conditional edge
timbal-codegen add-edge --source reviewer --target drafter \
  --when 'lambda: get_run_context().step_span("reviewer").output.content.find("NEEDS REVISION") != -1'

timbal-codegen add-edge --source reviewer --target publisher \
  --when 'lambda: get_run_context().step_span("reviewer").output.content.find("NEEDS REVISION") == -1'
```

**What changed:**
- `add_conditional_edges(source, router_func, mapping)` → multiple `add-edge --when` calls
- The router function's logic is inlined into lambda expressions
- Each return value of the router → one conditional edge to the corresponding target

---

## Step-by-step migration process

1. **Read the LangChain code** — identify imports, classes, and the overall pattern (Agent, LCEL, LangGraph)
2. **Choose entry point** — Agent (single LLM + tools) or Workflow (multi-step). See the decision table above
3. **Map the model** — find the `Chat*` class and extract the model name. Use `get-models --search "..."` to find the Timbal model ID
4. **Map tools** — for each `@tool` function, check if a framework tool exists (`get-tools --search "..."`) before writing a custom one
5. **Map the prompt** — extract system messages from `ChatPromptTemplate` or `SystemMessage` → `system_prompt`
6. **Map the steps** — each LCEL pipe stage or LangGraph node → `add-step`
7. **Wire data flow** — trace which state fields / outputs each step reads, then `set-param` to connect them
8. **Add ordering** — use `add-edge` for execution order not already implied by `set-param`. Use `--when` for conditional branches
9. **Drop the boilerplate** — `AgentExecutor`, `StrOutputParser`, `State` TypedDict, `START`/`END`, memory classes — these have no Timbal equivalent and are handled automatically

---

## Common LangChain patterns → Timbal tool search

```bash
# Web search / browsing tools
timbal-codegen get-tools --search "web"

# Gmail / email tools
timbal-codegen get-tools --search "gmail"

# Slack tools
timbal-codegen get-tools --search "slack"

# Vector store retrieval — use Timbal knowledge bases instead
# No direct tool equivalent — query via MCP (query_knowledge_base)

# HTTP requests — use a custom tool
# See Pattern 1 in the n8n reference for the httpx template
```

For any LangChain tool, try `get-tools --search "<service name>"` first. If nothing matches, convert the `@tool` function to a custom tool.

---

## Things that don't map directly

| LangChain feature | Timbal approach |
|---|---|
| **`ChatPromptTemplate` with `{variable}` placeholders** | Use `system_prompt` for the system message. Dynamic input comes from `set-param` or workflow invocation params |
| **`ConversationBufferMemory` / memory classes** | Timbal manages conversation context automatically |
| **`CallbackHandler` / callbacks** | No direct equivalent — use Timbal platform for observability |
| **`RunnableConfig` / configurable fields** | Use `set-config` for static config, `set-param --type value` for runtime values |
| **LangSmith tracing** | Timbal platform provides integrated observability with more complete features than LangSmith |
| **`VectorStoreRetriever`** | Use Timbal knowledge bases (vector/FTS/hybrid search via SQL) |
| **`RecursiveCharacterTextSplitter` / document loaders** | Upload documents to Timbal knowledge bases via the platform — chunking and embedding are handled automatically |
| **`RunnableWithMessageHistory`** | Timbal manages message history in the runtime |
| **Output parsers (`JsonOutputParser`, `PydanticOutputParser`)** | Usually unnecessary — configure structured output via the Agent if needed, or use a custom step for format conversion |
