# Decision Log

This document tracks significant design and implementation decisions made during the development of the MCP server.

## Project Structure

**Decision**: Move source code and project files to root directory instead of nested within llm folder.

**Rationale**: Provides a cleaner organization and more standard project layout, making it easier to navigate and maintain.

**Implications**: Keeps the llm directory focused on LLM-specific files like the seed prompt, while placing implementation code at the root level. 