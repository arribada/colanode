// ABOUTME: What the project dialogs offer for Plane, given what Plane has under
// ABOUTME: a code, and the wording of an alignment plan. Pure, so it is tested.
import {
  getProjectTemplatePage,
  ProjectAlignPlan,
  ProjectPlaneMode,
  ProjectPlaneStatus,
} from '@colanode/core';

export type PlaneChoice = {
  mode: ProjectPlaneMode;
  label: string;
  hint?: string;
};

// The first choice is the one preselected. Linking comes first when Plane
// already has the identifier: the code is the project's identity on both
// tools, so a free Plane project with the same code IS this project.
export const planeChoices = (
  status: ProjectPlaneStatus | undefined
): PlaneChoice[] => {
  const none: PlaneChoice = {
    mode: 'none',
    label: 'No Plane project for now',
    hint: 'It can be linked later by aligning the project again.',
  };

  if (!status) {
    return [];
  }

  switch (status.state) {
    case 'absent':
      return [
        {
          mode: 'create',
          label: 'Create the Plane project',
          hint: 'Same code, linked to the Overview page.',
        },
        none,
      ];
    case 'free':
      return [
        {
          mode: 'link',
          label: `Link to the Plane project "${status.project.name}"`,
          hint: `Plane already has ${status.project.identifier}${
            status.project.archived ? ' (archived)' : ''
          }, with no wiki page yet.`,
        },
        none,
      ];
    case 'linked':
      return [
        {
          mode: 'link',
          label: `Keep the link with "${status.project.name}"`,
        },
      ];
    case 'linked_elsewhere':
      return [
        {
          ...none,
          hint: `Plane's ${status.project.identifier} already points to another wiki page. Pick another code, or fix that link on Plane first.`,
        },
      ];
    case 'unreachable':
      return [{ ...none, hint: 'Plane is not answering right now.' }];
    case 'disabled':
      return [{ ...none, hint: 'The link with Plane is not set up here.' }];
  }
};

const roleName = (role: string): string =>
  getProjectTemplatePage(role)?.name ?? role;

// The alignment plan as the lines the dialog lists, in the order it is
// carried out.
export const describeAlignPlan = (plan: ProjectAlignPlan): string[] => {
  const lines: string[] = [];

  for (const entry of plan.roles) {
    if (entry.via === 'kept') {
      continue;
    }
    lines.push(
      entry.via === 'alias'
        ? `"${entry.name}" becomes the ${roleName(entry.role)} page (similar title)`
        : `"${entry.name}" becomes the ${roleName(entry.role)} page`
    );
  }
  for (const entry of plan.clear) {
    lines.push(`"${entry.name}" stops being a template page`);
  }
  for (const entry of plan.create) {
    lines.push(`Add the missing page "${entry.name}"`);
  }
  for (const entry of plan.registers) {
    lines.push(
      `Add the ${roleName(entry.role)} register at the top of "${entry.name}"`
    );
  }
  for (const option of plan.options) {
    if (option.action === 'rename') {
      lines.push(
        `${option.databaseName}: rename the option "${option.from}" to ${plan.code}`
      );
    } else if (option.action === 'add') {
      lines.push(`${option.databaseName}: add the option ${plan.code}`);
    }
  }
  switch (plan.plane.state) {
    case 'free':
      lines.push(`Link the Plane project "${plan.plane.project.name}"`);
      break;
    case 'linked_elsewhere':
      lines.push(
        `Plane's ${plan.plane.project.identifier} points to another wiki page: left as it is`
      );
      break;
    default:
      break;
  }

  return lines;
};
