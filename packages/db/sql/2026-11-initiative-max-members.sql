-- Clears the one initiative whose max_members is 0, so the check added in the
-- same change (initiative_max_members_check: null or > 0) can be created. The
-- API has refused 0 for a while ("zero would be an initiative nobody can
-- join"); null means uncapped. In production the only such row is archived
-- with no applications, so the change reaches nobody.
--
-- Run against production BEFORE that change deploys, or push fails adding the
-- check. One transaction; a second run changes nothing.

begin;

update "initiative" set "max_members" = null, "updated_at" = now()
 where "max_members" <= 0;

commit;