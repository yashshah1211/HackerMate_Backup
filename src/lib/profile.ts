import { supabase } from "./supabase";

export async function profileExists(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single();

  return !!data;
}