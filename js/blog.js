// Blog functionality
class BlogManager {
    constructor() {
        this.postsPerPage = 10;
        this.currentPage = 1;
        this.allPosts = [];
        this.init();
    }

    async init() {
        try {
            await this.loadPostsList();
            await this.loadCurrentPage();
            this.setupPagination();
        } catch (error) {
            console.error('Error initializing blog:', error);
            this.showError('Failed to load blog posts.');
        }
    }

    async loadPostsList() {
        const response = await fetch('posts/posts.json');
        const data = await response.json();
        this.allPosts = data.posts.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    async loadCurrentPage() {
        const container = document.getElementById('blog-content');
        container.innerHTML = '<div class="loading">Loading posts...</div>';

        const startIndex = (this.currentPage - 1) * this.postsPerPage;
        const endIndex = startIndex + this.postsPerPage;
        const postsToShow = this.allPosts.slice(startIndex, endIndex);

        container.innerHTML = '';

        for (const post of postsToShow) {
            try {
                const postElement = await this.renderPost(post);
                container.appendChild(postElement);
            } catch (error) {
                console.error(`Error loading post ${post.filename}:`, error);
            }
        }
    }

    async renderPost(postMeta) {
        const response = await fetch(`posts/${postMeta.filename}`);
        const markdown = await response.text();
        
        // Parse frontmatter
        const { frontmatter, content } = this.parseFrontmatter(markdown);
        
        // Convert markdown to HTML
        const htmlContent = marked.parse(content);
        
        // Create post element
        const postElement = document.createElement('article');
        postElement.className = 'blog-post';
        
        postElement.innerHTML = `
            <h2 class="post-title">
                <a href="#${postMeta.filename.replace('.md', '')}">${frontmatter.title || postMeta.title}</a>
            </h2>
            <div class="post-date">${this.formatDate(frontmatter.date || postMeta.date)}</div>
            <div class="post-content">${htmlContent}</div>
        `;
        
        return postElement;
    }

    parseFrontmatter(markdown) {
        const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
        const match = markdown.match(frontmatterRegex);
        
        if (match) {
            const frontmatterText = match[1];
            const content = match[2];
            const frontmatter = {};
            
            frontmatterText.split('\n').forEach(line => {
                const colonIndex = line.indexOf(':');
                if (colonIndex !== -1) {
                    const key = line.substring(0, colonIndex).trim();
                    const value = line.substring(colonIndex + 1).trim().replace(/^["']|["']$/g, '');
                    frontmatter[key] = value;
                }
            });
            
            return { frontmatter, content };
        }
        
        return { frontmatter: {}, content: markdown };
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    setupPagination() {
        const totalPages = Math.ceil(this.allPosts.length / this.postsPerPage);
        const paginationContainer = document.getElementById('pagination');
        
        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }

        let paginationHTML = '';
        
        // Previous button
        if (this.currentPage > 1) {
            paginationHTML += `<a href="#" class="pagination-btn" data-page="${this.currentPage - 1}">← Previous</a>`;
        }
        
        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            const activeClass = i === this.currentPage ? 'active' : '';
            paginationHTML += `<a href="#" class="pagination-btn ${activeClass}" data-page="${i}">${i}</a>`;
        }
        
        // Next button
        if (this.currentPage < totalPages) {
            paginationHTML += `<a href="#" class="pagination-btn" data-page="${this.currentPage + 1}">Next →</a>`;
        }
        
        paginationContainer.innerHTML = paginationHTML;
        
        // Add event listeners
        paginationContainer.addEventListener('click', (e) => {
            e.preventDefault();
            if (e.target.classList.contains('pagination-btn')) {
                const page = parseInt(e.target.dataset.page);
                this.goToPage(page);
            }
        });
    }

    async goToPage(page) {
        this.currentPage = page;
        await this.loadCurrentPage();
        this.setupPagination();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Update URL without reloading
        const url = new URL(window.location);
        url.searchParams.set('page', page);
        window.history.pushState({}, '', url);
    }

    showError(message) {
        const container = document.getElementById('blog-content');
        container.innerHTML = `<div class="error">${message}</div>`;
    }
}

// Initialize blog when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check if marked.js is loaded
    if (typeof marked === 'undefined') {
        console.error('marked.js is not loaded');
        return;
    }
    
    // Get page from URL
    const urlParams = new URLSearchParams(window.location.search);
    const page = parseInt(urlParams.get('page')) || 1;
    
    const blog = new BlogManager();
    blog.currentPage = page;
});