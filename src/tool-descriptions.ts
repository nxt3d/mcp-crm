export const toolDescriptions = {
  add_contact: {
    description: `Create a new contact in the CRM system with personal and professional information`,
    
    name: `Full name of the contact`,
    
    organization: `Organization/company name`,
    
    job_title: `Job title or position`,
    
    email: `Email address`,
    
    phone: `Phone number`,
    
    telegram: `Telegram username or handle`,
    
    x_account: `X (Twitter) username or handle`,
    
    notes: `Additional notes about the contact`
  },

  list_contacts: {
    description: `List all active contacts in the CRM system with optional archived contacts`,
    
    include_archived: `Whether to include archived contacts (default: false)`
  },

  get_contact_details: {
    description: `Retrieve complete information for a specific contact by ID`,
    
    id: `Contact ID to retrieve details for`
  },

  search_contacts: {
    description: `Search for contacts by name, organization, job title, email, or social handles`,
    
    query: `Search query to match against name, organization, job title, email, telegram, or x_account`
  },

  list_contacts_by_organization: {
    description: `Filter and list all contacts belonging to a specific organization`,
    
    organization: `Organization name to filter contacts by`
  },

  archive_contact: {
    description: `Archive (soft delete) a contact to remove it from active lists while preserving data`,
    
    id: `Contact ID to archive`
  },

  update_contact: {
    description: `Update existing contact information with new details`,
    
    id: `Contact ID to update`,
    
    name: `Updated full name`,
    
    organization: `Updated organization/company name`,
    
    job_title: `Updated job title or position`,
    
    email: `Updated email address`,
    
    phone: `Updated phone number`,
    
    telegram: `Updated Telegram username or handle`,
    
    x_account: `Updated X (Twitter) username or handle`,
    
    notes: `Updated notes about the contact`
  },

  add_contact_entry: {
    description: `Add a new interaction entry to a contact's history with proper historical dating`,
    
    contact_id: `Contact ID to add entry for`,
    
    entry_type: `Type of interaction`,
    
    subject: `Brief subject/title of the entry`,
    
    content: `Detailed content of the entry`,
    
    interaction_date: `REQUIRED: The actual date when the interaction occurred 
    (ISO datetime string, e.g. '2025-05-27T10:30:00Z'). 
    
    This field is required to ensure proper historical accuracy. 
    
    The system never uses automatic timestamps - you must always specify when the interaction actually happened.
    
    Examples:
    - "2025-05-30T14:30:00Z" for EthPrague conference meeting
    - "2023-11-15T11:04:00Z" for initial Telegram contact
    - "2025-06-04T12:32:00Z" for detailed strategy discussion
    - "2025-06-05T09:24:00Z" for CRM administrative tasks
    
    Always provide the exact historical date and time.`
  },

  update_contact_entry: {
    description: `Update an existing contact history entry, including correcting historical dates`,
    
    entry_id: `Contact entry ID to update`,
    
    entry_type: `Updated type of interaction`,
    
    subject: `Updated subject/title of the entry`,
    
    content: `Updated detailed content of the entry`,
    
    interaction_date: `OPTIONAL: Update the actual date when the interaction occurred 
    (ISO datetime string, e.g. '2025-05-27T10:30:00Z'). 
    
    Use this to correct dates or move entries to their proper chronological position.
    Only specify this if you want to change the date - otherwise the existing date is preserved.`
  },

  get_contact_history: {
    description: `Retrieve all interaction history for a specific contact in chronological order`,
    
    contact_id: `Contact ID to get history for`,
    
    limit: `Maximum number of entries to return (default: all)`
  },

  get_recent_activities: {
    description: `Get recent CRM activities across all contacts for overview and monitoring`,
    
    limit: `Maximum number of recent activities to return (default: 10)`
  },

  export_contacts_csv: {
    description: `Export all contacts to CSV format for backup or external analysis`,
    
    include_archived: `Whether to include archived contacts (default: false)`
  },

  export_contact_history_csv: {
    description: `Export contact interaction history to CSV format for reporting and analysis. When exporting for a specific contact, includes contact information at the top of the CSV file.`,
    
    contact_id: `Specific contact ID to export history for (omit for all contacts)`
  },

  export_full_crm_csv: {
    description: `Export complete CRM data with history concatenated into single cells per contact for streamlined analysis`,
    
    random_string: `Dummy parameter for no-parameter tools`
  },

  export_todos_csv: {
    description: `Export all todos (active and completed) to CSV format for task management and analysis`,
    
    random_string: `Dummy parameter for no-parameter tools`
  },



  add_todo: {
    description: `Add a todo item for a specific contact with optional target date`,
    
    contact_id: `Contact ID to add todo for`,
    
    todo_text: `Todo description or task details`,
    
    target_date: `Target completion date (ISO datetime string, e.g. '2025-06-15T10:00:00Z')`
  },

  update_todo: {
    description: `Update an existing todo item - modify text, target date, or completion status`,
    
    todo_id: `Todo ID to update`,
    
    todo_text: `Updated todo description`,
    
    target_date: `Updated target completion date (ISO datetime string)`,
    
    is_completed: `Mark todo as completed (true) or incomplete (false)`
  },

  get_todos: {
    description: `Retrieve and list todos with filtering options for contact, date ranges, and completion status. 
    
    Use this tool when users ask questions like:
    - "What are my todos?"
    - "Get my todos"
    - "Show me my todo list"
    - "What tasks do I have?"
    - "List my pending todos"
    - "What do I need to do?"
    - "Show todos for [contact name]"
    - "What todos are due soon?"
    
    This tool helps manage and track action items and tasks associated with contacts in the CRM system.`,
    
    contact_id: `Filter by specific contact ID to show todos for a particular contact`,
    
    include_completed: `Include completed todos in results (default: false) - set to true to see finished tasks`,
    
    days_ahead: `Show todos due within X days from now (e.g., days_ahead: 7 for todos due in the next week)`,
    
    days_old: `Show todos created more than X days ago (useful for finding old/stale todos)`
  }
}; 