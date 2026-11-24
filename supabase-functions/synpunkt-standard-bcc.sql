-- Standardadress för dold kopia på svar till medlemmar (per förening).
alter table public.property_letterhead add column if not exists reply_bcc text;

-- RTB: styrelsens brevlåda får alltid dold kopia (föreningen känns igen på sin svarsadress @brf-rtb.se).
update public.property_letterhead
   set reply_bcc = 'styrelse@brf-rtb.se'
 where lower(coalesce(email, '')) like '%@brf-rtb.se'
   and coalesce(reply_bcc, '') = '';
