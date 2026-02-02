/**
 * Resource Ownership Verification Utilities
 *
 * Helper functions to ensure multi-tenant data isolation.
 * Always verify ownership before serving or modifying user data.
 */

/**
 * Verify that the authenticated user owns the resource.
 *
 * @param authenticatedUserId - The ID of the currently authenticated user
 * @param resourceUserId - The userId associated with the resource
 * @returns true if the user owns the resource, false otherwise
 *
 * @example
 * ```typescript
 * const session = await requireAuth(request);
 * const resource = await getResource(id);
 *
 * if (!ensureUserOwnsResource(session.user.id, resource.userId)) {
 *   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
 * }
 * ```
 */
export function ensureUserOwnsResource(
  authenticatedUserId: string,
  resourceUserId: string | undefined | null
): boolean {
  if (!resourceUserId) {
    return false;
  }
  return authenticatedUserId === resourceUserId;
}

/**
 * Throw an error if the user does not own the resource.
 * Use this when you want to fail fast with an exception.
 *
 * @param authenticatedUserId - The ID of the currently authenticated user
 * @param resourceUserId - The userId associated with the resource
 * @throws Error if ownership verification fails
 *
 * @example
 * ```typescript
 * const session = await requireAuth(request);
 * const resource = await getResource(id);
 *
 * // Will throw if user doesn't own resource
 * assertUserOwnsResource(session.user.id, resource.userId);
 *
 * // Safe to proceed with resource access
 * return resource;
 * ```
 */
export function assertUserOwnsResource(
  authenticatedUserId: string,
  resourceUserId: string | undefined | null
): void {
  if (!ensureUserOwnsResource(authenticatedUserId, resourceUserId)) {
    throw new Error('Forbidden: User does not own this resource');
  }
}

/**
 * Filter an array of resources to only include those owned by the user.
 *
 * @param authenticatedUserId - The ID of the currently authenticated user
 * @param resources - Array of resources with a userId property
 * @returns Filtered array containing only resources owned by the user
 *
 * @example
 * ```typescript
 * const session = await requireAuth(request);
 * const allResources = await getAllResources();
 *
 * // Only return resources belonging to the authenticated user
 * const userResources = filterOwnedResources(session.user.id, allResources);
 * ```
 */
export function filterOwnedResources<T extends { userId?: string | null }>(
  authenticatedUserId: string,
  resources: T[]
): T[] {
  return resources.filter((resource) =>
    ensureUserOwnsResource(authenticatedUserId, resource.userId)
  );
}
