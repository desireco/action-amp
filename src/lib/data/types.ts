export interface InboxItem {
    id: string;
    title: string;
    type?: 'action' | 'note' | 'link' | 'idea' | 'resource';
    captured: Date;
    content?: string;
}

export interface ActionItem {
    id: string;
    title: string;
    status: 'todo' | 'completed' | 'in_progress' | 'blocked' | 'cancelled';
    priority: 'high' | 'medium' | 'low';
    created: Date;
    completed?: Date;
    content?: string;
}

export interface Project {
    name: string;
    area: string;
    status: 'active' | 'archived' | 'completed' | 'on_hold';
    priority: 'high' | 'medium' | 'low';
    created: Date;
    due_date?: Date;
    description?: string;
    archived_date?: Date;
    archived_reason?: string;
}

export interface Area {
    name: string;
    description?: string;
    priority: 'high' | 'medium' | 'low';
    active: boolean;
    created: Date;
}
