// shadcn/ui sidebar, split into focused modules so each stays reviewable and
// under the repo's 500-line ceiling. This barrel preserves the original
// `@/components/ui/sidebar` import surface.
export { SidebarProvider, useSidebar, type SidebarContextProps } from "./context";
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "./shell";
export {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "./group";
export {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  sidebarMenuButtonVariants,
} from "./menu";
