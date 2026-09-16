import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NotificationType, AppNotification } from "@/lib/leads/types";

interface CreateNotificationParams {
  userId: string;
  leadId?: string;
  type: NotificationType;
  title: string;
  body?: string;
  metadata?: Record<string, any>;
}

export async function createNotification(params: CreateNotificationParams): Promise<{ data: AppNotification | null, error: string | null }> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("notifications").insert({
      user_id: params.userId,
      lead_id: params.leadId || null,
      type: params.type,
      title: params.title,
      body: params.body || null,
      metadata: params.metadata || null
    }).select().single();

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error("Error creating notification:", error);
    return { data: null, error: error.message || "Failed to create notification" };
  }
}

export async function getUserNotifications(userId: string, limit = 50): Promise<{ data: AppNotification[] | null, error: string | null }> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error("Error fetching notifications:", error);
    return { data: null, error: error.message || "Failed to fetch notifications" };
  }
}

export async function markNotificationRead(notificationId: string): Promise<{ error: string | null }> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId);

    if (error) throw error;

    return { error: null };
  } catch (error: any) {
    console.error("Error marking notification read:", error);
    return { error: error.message || "Failed to mark notification as read" };
  }
}

