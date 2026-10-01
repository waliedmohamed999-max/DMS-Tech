import {
  ArrowLeft, ArrowRight, Award, BadgeCheck, Blocks, Bot, BrainCircuit, Briefcase, Building2, Cable, Calendar,
  ExternalLink, Columns, PhoneCall, Tag, Archive, RotateCcw, Trophy, CircleX, Pencil, Bookmark, CalendarClock, ChartColumn, ChartLine, ChartNoAxesCombined, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleCheck, ClipboardList, Clock, Cloud, CloudUpload, Cog, CreditCard, Crosshair, DatabaseZap, FileSearch,
  FileText, Filter, Gauge, Gem, Globe, GraduationCap, Handshake, Headset, House, Image, Inbox, Languages, Layers,
  LayoutDashboard, LayoutTemplate, LifeBuoy, Lightbulb, Link, Mail, MapPin, Megaphone, Menu, MessageSquareMore,
  MessagesSquare, Monitor, MonitorSmartphone, MousePointerClick, Network, Package, Palette, PenTool, Phone, Play,
  Plug, Rocket, Route, Search, SearchCheck, Send, Server, Settings, Share2, ShieldCheck, ShoppingBag, ShoppingCart,
  SlidersHorizontal, Smartphone, Sparkles, Star, Stethoscope, Target, Timer, TrendingUp, Users, Workflow, X, Zap,
  type LucideProps
} from "lucide-react";

/**
 * Icon registry. Content stores icon *names* (strings) so the future dashboard can
 * pick icons from a list; this map turns them into components and keeps the bundle
 * limited to the icons we actually use.
 */
const registry = {
  ArrowLeft, ArrowRight, Award, BadgeCheck, Blocks, Bot, BrainCircuit, Briefcase, Building2, Cable, Calendar,
  ExternalLink, Columns, PhoneCall, Tag, Archive, RotateCcw, Trophy, CircleX, Pencil, Bookmark, CalendarClock, ChartColumn, ChartLine, ChartNoAxesCombined, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleCheck, ClipboardList, Clock, Cloud, CloudUpload, Cog, CreditCard, Crosshair, DatabaseZap, FileSearch,
  FileText, Filter, Gauge, Gem, Globe, GraduationCap, Handshake, Headset, House, Image, Inbox, Languages, Layers,
  LayoutDashboard, LayoutTemplate, LifeBuoy, Lightbulb, Link, Mail, MapPin, Megaphone, Menu, MessageSquareMore,
  MessagesSquare, Monitor, MonitorSmartphone, MousePointerClick, Network, Package, Palette, PenTool, Phone, Play,
  Plug, Rocket, Route, Search, SearchCheck, Send, Server, Settings, Share2, ShieldCheck, ShoppingBag, ShoppingCart,
  SlidersHorizontal, Smartphone, Sparkles, Star, Stethoscope, Target, Timer, TrendingUp, Users, Workflow, X, Zap
} as const;

export type IconName = keyof typeof registry;

export const iconNames = Object.keys(registry) as IconName[];

export function Icon({ name, size = 20, strokeWidth = 1.75, ...props }: { name: IconName } & LucideProps) {
  const Cmp = registry[name];
  return <Cmp size={size} strokeWidth={strokeWidth} aria-hidden="true" {...props} />;
}

