// Publishing adapter — wraps Blotato / Ayrshare (Phase 1), direct Meta/TikTok APIs (Phase 2)
// All publish/schedule/analytics calls go through these functions.

export type PublishingResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type Platform = 'instagram' | 'tiktok' | 'facebook';

export interface PublishInput {
  tenantId: string;
  platform: Platform;
  mediaUrl: string;
  caption: string;
  scheduledAt?: Date;
}

export interface PublishOutput {
  platformPostId: string;
  url: string;
  publishedAt: Date;
}

export interface ScheduleOutput {
  scheduledPostId: string;
  scheduledAt: Date;
}

export interface AnalyticsOutput {
  postId: string;
  impressions: number;
  reach: number;
  engagements: number;
  likes: number;
  comments: number;
  shares: number;
  fetchedAt: Date;
}

export async function publishPost(
  _input: PublishInput,
): Promise<PublishingResult<PublishOutput>> {
  throw new Error('publishPost: not implemented — wire in Module 8');
}

export async function schedulePost(
  _input: PublishInput & { scheduledAt: Date },
): Promise<PublishingResult<ScheduleOutput>> {
  throw new Error('schedulePost: not implemented — wire in Module 8');
}

export async function getAnalytics(
  _postId: string,
  _tenantId: string,
): Promise<PublishingResult<AnalyticsOutput>> {
  throw new Error('getAnalytics: not implemented — wire in Module 9');
}
