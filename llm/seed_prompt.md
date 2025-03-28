# MCP Server Development Agent Prompt

## Project Overview
You are tasked with creating an MCP (Message Control Protocol) server that connects with Claude desktop and integrates with Twitch chat. The server should enable an LLM to read Twitch chat when prompted by a user and provide summaries of chat activity. For example, when asked "what is happening in xqc's stream?", the system should automatically read the Twitch chat in the xqc channel for a configurable duration (default: 1 minute) and then provide a summary.

## Core Features
1. Connect with Claude desktop
2. Authenticate with Twitch API
3. Observe Twitch chat in specified channels
4. Allow sending messages to Twitch chat
5. Parse user queries to determine relevant Twitch channels
6. Provide summaries of chat activity

## Development Approach
Follow these software development principles:
- Start Simple, Plan for Complexity
- Design Clean Boundaries
- Minimal Viable Infrastructure
- Core Value First
- Observable by Default
- Automation from Day One
- Test for Resilience
- Consistent Interfaces
- Progressive Enhancement

## Project Structure
Use the following project structure:
- `llm/` - Main project directory
  - `docs/` - Documentation
    - `architecture.md` - System architecture
    - `decisions.md` - Decision log
    - `challenges.md` - Implementation challenges
  - `src/` - Source code
    - `mcp/` - MCP server components
    - `twitch/` - Twitch integration components
    - `claude/` - Claude integration components
    - `tools/` - Tool definitions for Claude
  - `tests/` - Test suite
  - `config/` - Configuration files
  - `progress.md` - Progress tracker
  - `plan.md` - Implementation plan

## Development Workflow

### Initial Setup Phase
1. Create the project structure
2. Set up the basic documentation
3. Create a detailed implementation plan
4. Set up a progress tracking system

### Implementation Phase
Implement the solution in the following logical steps:

1. **Core Infrastructure**
   - Set up basic project structure and dependencies
   - Implement configuration loading

2. **Twitch Integration**
   - Implement Twitch authentication
   - Create chat observation functionality
   - Set up message sending functionality

3. **MCP Protocol Implementation**
   - Define the protocol for communication with Claude
   - Implement tool definition for chat observation
   - Create the server endpoint for Claude

4. **Integration & Testing**
   - Connect all components
   - Implement comprehensive testing
   - Create sample prompts for Claude

For each task:
1. Document the approach in the relevant documentation files
2. Implement the feature
3. Write tests for the feature
4. Test the feature
5. Update the progress tracker
6. Commit and push changes

## Documentation Requirements

### plan.md
Detail the step-by-step implementation plan including:
- Major milestones
- Dependencies between tasks
- Estimated complexity

### decisions.md
Document all significant design and implementation decisions:
- What was decided
- Why it was chosen over alternatives
- Potential future implications

### challenges.md
Record any significant implementation challenges:
- Description of the challenge
- Attempted solutions
- Final resolution
- Lessons learned

### progress.md
Track progress using the following format:
```md
# Implementation Progress

## Core Infrastructure
- [x] Set up project structure
- [x] Initialize documentation
- [ ] Implement configuration loading
...

## Twitch Integration
- [ ] Implement Twitch authentication
...
```

## Implementation Guidelines

### Twitch Integration
- Use a Twitch bot library that supports reading chat
- Implement configurable authentication
- Store Twitch tokens securely
- Design the chat observation to be non-blocking
- Implement rate limiting to avoid Twitch API restrictions

### MCP Protocol
- Define a clean, simple protocol for tool invocation
- Ensure error handling for all API calls
- Document all protocol elements
- Create a versioning strategy

### Testing Strategy
- Create unit tests for each component
- Implement integration tests for connected components
- Create mock objects for external dependencies
- Develop simple end-to-end tests

## Completion Criteria
The project is considered complete when:
1. The MCP server successfully connects to Claude desktop
2. The system can authenticate with Twitch
3. Claude can invoke the tool to read specific Twitch channels
4. The system can observe chat for a configurable duration
5. The system can send messages to Twitch chat
6. All code is tested and documented
7. The progress tracker shows all items as complete

## Implementation Steps

1. **Project Initialization**
   - Create the project directory structure
   - Initialize documentation files
   - Create the progress tracker
   - Document the initial plan

2. **Core Infrastructure**
   - Set up dependency management
   - Implement configuration loading
   - Create logging infrastructure

3. **Twitch Authentication**
   - Implement token management
   - Create authentication flow
   - Test connection to Twitch API

4. **Twitch Chat Observation**
   - Implement channel connection
   - Create message parsing
   - Implement duration control
   - Add message buffering

5. **Twitch Message Sending**
   - Implement send message functionality
   - Add rate limiting
   - Create message queueing

6. **MCP Tool Definition**
   - Define tool schema
   - Implement parameter parsing
   - Create response formatting

7. **Claude Integration**
   - Set up server endpoint
   - Implement tool registration
   - Create prompt templates

8. **Testing and Verification**
   - Implement unit tests
   - Create integration tests
   - Perform end-to-end testing

9. **Documentation Finalization**
   - Complete all documentation
   - Create usage examples
   - Document future enhancement paths

For each step:
1. Update relevant documentation
2. Implement the functionality
3. Write tests
4. Verify functionality
5. Update progress
6. Commit and push changes

## Testing Each Component

### Twitch Authentication
- Test with valid credentials
- Test with invalid credentials
- Verify token refresh

### Chat Observation
- Test with active channels
- Test with inactive channels
- Verify message capture over time
- Test duration configuration

### Message Sending
- Test sending to valid channels
- Test rate limiting
- Verify message delivery

### Tool Integration
- Test parameter parsing
- Test error handling
- Verify response formatting

## Final Deliverables
1. Complete codebase in the `llm/` directory
2. Comprehensive documentation
3. Full test suite
4. Sample prompts for Claude
5. Configuration examples

Remember to maintain clean, modular code with clear boundaries between components. Focus on delivering core functionality first before adding enhancements. Document all decisions and challenges thoroughly, and keep the progress tracker updated.