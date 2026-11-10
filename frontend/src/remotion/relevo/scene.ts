import type React from 'react'
import { Interactive, type InteractivitySchema } from 'remotion'
import type { Lang } from './data'

const langSchema = {
  lang: { type: 'enum', default: 'en', description: 'Language', variants: { en: {}, es: {} } },
} as const satisfies InteractivitySchema

export type SceneProps = { readonly lang: Lang }

/** interactivity SKILL: each scene is an interactive, full-frame component with its own timeline. */
export const scene = (Component: React.FC<SceneProps>, componentName: string) =>
  Interactive.withSchema({ Component, componentName, schema: langSchema, wrapInSequence: true, layout: 'absolute-fill' })
