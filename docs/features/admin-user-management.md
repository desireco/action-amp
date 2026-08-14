---
slug: admin-user-management
title: "Admin user management and activity directory"
feature_area: foundation
status: shipped
spec: admin-user-management.md
---

# Admin user management and activity directory

**Code and local browser verified.** `/do/admin/users`
is an admin-only, cursor-paged directory with signed-up, last-login, and
last-active timestamps plus rolling login, app-open, creation, and completion
metrics. Search, access filters, and sort state are URL-backed.

**Account actions.** Admins can grant Pro, Founder, or Friend access, remove a
manual grant, and permanently delete an eligible local account after a normal
confirmation. Visible non-admin accounts can be selected for a one-confirmation
bulk cleanup; protected accounts are skipped. Each mutation is audited; deletion
fails closed when recurring Stripe billing cannot be verified and preserves
detached payment records.

**Locked access distinction.** Friend is unlimited internal access but is not
Founder, does not consume a Founding-100 slot, and never creates Stripe/payment
history. See [`admin-user-management.md`](../specs/admin-user-management.md).
