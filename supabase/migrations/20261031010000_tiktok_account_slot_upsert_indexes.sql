-- Required by zoz-pro-studio OAuth callback upserts.
-- Keep guarded so this migration is safe in projects where the studio tables are not provisioned.
DO $$
BEGIN
  IF to_regclass('public.zoz_pro_channels') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS zoz_pro_channels_platform_account_key_uidx
      ON public.zoz_pro_channels (platform, account_key);
  END IF;

  IF to_regclass('public.zoz_pro_channel_tokens') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS zoz_pro_channel_tokens_platform_account_key_uidx
      ON public.zoz_pro_channel_tokens (platform, account_key);
  END IF;
END
$$;
