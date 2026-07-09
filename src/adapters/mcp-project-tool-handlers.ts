import { join } from 'node:path';
import {
  applyConfigProfile,
  buildConfigProfileStatus,
  configProfiles,
  findConfigProfile,
} from '../core/config-profiles.js';
import { doctor, getEnglishPilotHome, loadConfig, writeDoctorMarkdown } from '../core/config.js';
import { buildExternalValidationBundle, verifyExternalValidationBundle } from '../core/external-validation-bundle.js';
import { applyRatioProgressionSuggestion, buildRatioProgressionSuggestion } from '../core/ratio-progression.js';
import {
  buildRoadmap,
  buildRoadmapEnvTemplate,
  buildRoadmapNextActions,
  isRoadmapTarget,
  writeRoadmapMarkdown,
  writeRoadmapNextActionsMarkdown,
} from '../core/roadmap.js';
import { buildProjectStatus } from '../core/status.js';
import { listPromptEvents } from '../storage/repository.js';
import { optionalBoolean, optionalString, requireString } from './mcp-tool-arguments.js';
import { mcpToolNames, type EnglishPilotMcpToolName } from './mcp-tool-registry.js';

export function handleProjectMcpTool(
  name: EnglishPilotMcpToolName,
  args: Record<string, unknown>,
): Record<string, unknown> | undefined {
  switch (name) {
    case 'english_status':
      return buildProjectStatus(mcpToolNames) as unknown as Record<string, unknown>;
    case 'english_roadmap': {
      const target = optionalRoadmapTarget(args);
      const roadmap = buildRoadmap({ target });
      const roadmapExport =
        optionalBoolean(args, 'write') === true
          ? writeRoadmapMarkdown(
              roadmap,
              optionalString(args, 'directory') ?? join(getEnglishPilotHome(), 'roadmap'),
              target,
            )
          : undefined;
      return (roadmapExport ? { ...roadmap, export: roadmapExport } : roadmap) as unknown as Record<string, unknown>;
    }
    case 'english_roadmap_next': {
      const target = optionalRoadmapTarget(args);
      const nextActions = buildRoadmapNextActions(buildRoadmap({ target }));
      const nextActionsExport =
        optionalBoolean(args, 'write') === true
          ? writeRoadmapNextActionsMarkdown(
              nextActions,
              optionalString(args, 'directory') ?? join(getEnglishPilotHome(), 'roadmap'),
              target,
            )
          : undefined;
      return (nextActionsExport ? { ...nextActions, export: nextActionsExport } : nextActions) as unknown as Record<
        string,
        unknown
      >;
    }
    case 'english_roadmap_env_template': {
      const target = optionalRoadmapTarget(args);
      return buildRoadmapEnvTemplate({ target }) as unknown as Record<string, unknown>;
    }
    case 'english_external_validation_bundle': {
      const target = optionalRoadmapTarget(args);
      return buildExternalValidationBundle({
        directory: optionalString(args, 'directory') ?? join(getEnglishPilotHome(), 'external-validation'),
        target,
        write: optionalBoolean(args, 'write') ?? false,
      }) as unknown as Record<string, unknown>;
    }
    case 'english_external_validation_bundle_verify': {
      const target = optionalRoadmapTarget(args);
      return verifyExternalValidationBundle({
        directory: optionalString(args, 'directory') ?? join(getEnglishPilotHome(), 'external-validation'),
        target,
      }) as unknown as Record<string, unknown>;
    }
    case 'english_config_profiles':
      return { profiles: configProfiles } as unknown as Record<string, unknown>;
    case 'english_config_use': {
      const profile = findConfigProfile(requireString(args, 'profile'));
      if (!profile) throw new Error('MCP argument profile must be beginner, balanced, strict, or force.');
      return {
        profile,
        config: applyConfigProfile(profile),
      } as unknown as Record<string, unknown>;
    }
    case 'english_config_profile_status':
      return buildConfigProfileStatus() as unknown as Record<string, unknown>;
    case 'english_config_progression_suggestion':
      return buildRatioProgressionSuggestion(loadConfig(), listPromptEvents()) as unknown as Record<string, unknown>;
    case 'english_config_progression_apply':
      return applyRatioProgressionSuggestion(loadConfig(), listPromptEvents(), {
        apply: optionalBoolean(args, 'apply') ?? false,
      }) as unknown as Record<string, unknown>;
    case 'english_doctor': {
      const report = doctor();
      const doctorExport =
        optionalBoolean(args, 'write') === true
          ? writeDoctorMarkdown(report, optionalString(args, 'directory') ?? join(getEnglishPilotHome(), 'diagnostics'))
          : undefined;
      return (doctorExport ? { ...report, export: doctorExport } : report) as unknown as Record<string, unknown>;
    }
    default:
      return undefined;
  }
}

function optionalRoadmapTarget(args: Record<string, unknown>): 'feishu' | 'wechat' | 'cloud-stt' | undefined {
  const target = optionalString(args, 'target');
  if (target !== undefined && !isRoadmapTarget(target)) {
    throw new Error('MCP argument target must be feishu, wechat, or cloud-stt when provided.');
  }
  return target;
}
