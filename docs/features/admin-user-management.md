---
slug: admin-user-management
title: "Admin user management and activity directory"
feature_area: foundation
status: missing
spec: admin-user-management.md
---

# Admin user management and activity directory

**Planned, not in code.** The admin workspace currently has aggregate user
metrics but no individual user directory. This feature adds an admin-only Users
route with user activity, signup/login timestamps, manual Pro/Founder/Friend
grants, and safe account deletion.

**Locked access distinction.** Friend is unlimited internal access but is not
Founder, does not consume a Founding-100 slot, and never creates Stripe/payment
history. See [`admin-user-management.md`](../specs/admin-user-management.md).
