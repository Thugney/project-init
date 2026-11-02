---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
inputDocuments:
  - prd.md
  - architecture.md
---

# Fixture Export - Epic Breakdown

## Overview

Synthetic epic and stories for the BMAD v6 adapter fixture.

## Requirements Inventory

- FR-1: Create a fixture export.
- FR-2: Validate a fixture export.

## Epic List

- Epic 1: Fixture Export

## Epic 1: Fixture Export

Implement and validate synthetic exports.

### Story 1.1: Create fixture export

As a fixture user, I want a sample export, so that discovery can find a ready story.

**Acceptance Criteria:**

**Given** a fixture project **When** the export story is read **Then** its task list is discoverable.

### Story 1.2: Validate fixture export

As a fixture user, I want a sample validation story, so that discovery can find an in-progress story.

**Acceptance Criteria:**

**Given** a fixture export **When** the validation story is read **Then** its status comes from sprint tracking.
