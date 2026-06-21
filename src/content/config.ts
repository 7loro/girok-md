import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    tags: z.array(z.string()).optional(),
    summary: z.string().optional(),
    image: z.string().optional(),
    author: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    created: z.string().optional(),
    modified: z.string().optional(),
    lang: z.string().optional(),
    translated_from: z.string().optional(),
    translate_sync_at: z.string().optional(),
  }),
});

export const collections = { posts };
